import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { lockAccount, recomputeAccount } from "./account-ledger";
import { audit } from "./audit";
import {
  isReturnable,
  remainingQuantity,
  returnAmount,
  type AdjustmentInput,
  type ReturnInput,
} from "./customer-credit";
import { fromMilli, toMilli } from "./quantity";
import { recordCreditNoteMovements } from "./stock-ledger";

/** Una nota de crédito que no se puede hacer o anular, con el motivo. */
export class CreditNoteError extends Error {
  constructor(
    readonly code: "notFound" | "notReturnable" | "quantity" | "alreadyVoided",
  ) {
    super(code);
  }
}

const ENTITY = "CUSTOMER_CREDIT_NOTE" as const;

/**
 * Devolución de mercadería de un pedido entregado: crea la nota de crédito
 * con la foto del precio y la alícuota del pedido, ingresa lo devuelto al
 * depósito (lo que se da de baja entra y sale en el mismo acto, así queda en
 * el libro) y recalcula la cuenta. Orden de bloqueo: cuenta del cliente y
 * después el pedido, como cobros y cambios de estado.
 */
export async function createReturn(
  tx: Prisma.TransactionClient,
  saleId: string,
  input: ReturnInput,
  userId: string,
) {
  const owner = await tx.sale.findUnique({
    where: { id: saleId },
    select: { address: { select: { customerId: true } } },
  });
  if (!owner) throw new CreditNoteError("notFound");
  const customerId = owner.address.customerId;
  await lockAccount(tx, customerId);
  const [locked] = await tx.$queryRaw<
    { state: Parameters<typeof isReturnable>[0]; number: number }[]
  >`SELECT "state", "number" FROM "sales" WHERE "id" = ${saleId} FOR UPDATE`;
  if (!locked) throw new CreditNoteError("notFound");
  if (!isReturnable(locked.state)) throw new CreditNoteError("notReturnable");

  // Con la cuenta bloqueada: dos devoluciones a la vez no pasan lo entregado.
  const [items, previous] = await Promise.all([
    tx.saleItem.findMany({ where: { saleId } }),
    tx.customerCreditNoteItem.findMany({
      where: { creditNote: { saleId, voidedAt: null } },
      select: { productId: true, quantity: true },
    }),
  ]);
  const returned = new Map<string, bigint>();
  for (const row of previous) {
    returned.set(
      row.productId,
      (returned.get(row.productId) ?? BigInt(0)) + toMilli(row.quantity),
    );
  }

  const lines = input.lines.map((line) => {
    const item = items.find((row) => row.productId === line.productId);
    if (!item) throw new CreditNoteError("quantity");
    const left = remainingQuantity({
      quantity: item.quantity,
      returned: fromMilli(returned.get(item.productId) ?? BigInt(0)),
    });
    if (toMilli(line.quantity) > toMilli(left)) {
      throw new CreditNoteError("quantity");
    }
    return { ...line, item };
  });

  const note = await tx.customerCreditNote.create({
    data: {
      customerId,
      saleId,
      kind: "RETURN",
      amount: returnAmount(
        lines.map(({ quantity, item }) => ({
          quantity,
          unitPrice: item.unitPrice,
          unitTaxRate: item.unitTaxRate,
        })),
      ),
      reason: input.reason,
      warehouseId: input.warehouseId,
      createdById: userId,
      items: {
        create: lines.map(({ quantity, destination, item }) => ({
          productId: item.productId,
          quantity,
          unitPrice: item.unitPrice,
          unitTaxRate: item.unitTaxRate,
          unitCost: item.unitCost,
          destination,
        })),
      },
    },
    include: { items: true },
  });

  // Todo lo devuelto ingresa; lo que no sirve se da de baja enseguida.
  const entries = lines.map(({ quantity, item }) => ({
    productId: item.productId,
    warehouseId: input.warehouseId,
    quantity,
  }));
  await recordCreditNoteMovements(tx, note, "CUSTOMER_RETURN", entries, userId);
  const writeOffs = lines
    .filter((line) => line.destination === "WRITE_OFF")
    .map(({ quantity, item }) => ({
      productId: item.productId,
      warehouseId: input.warehouseId,
      quantity: fromMilli(-toMilli(quantity)),
    }));
  await recordCreditNoteMovements(tx, note, "WRITE_OFF", writeOffs, userId);

  await audit(tx, {
    action: "CREATE",
    actorUserId: userId,
    entityType: ENTITY,
    entityId: note.id,
    after: note,
    metadata: { saleNumber: locked.number },
  });
  await recomputeAccount(tx, customerId);
  return note;
}

/** Nota de crédito por importe (bonificación o ajuste): sin mercadería ni stock. */
export async function createAdjustment(
  tx: Prisma.TransactionClient,
  customerId: string,
  input: AdjustmentInput,
  userId: string,
) {
  if (!(await lockAccount(tx, customerId))) {
    throw new CreditNoteError("notFound");
  }
  const note = await tx.customerCreditNote.create({
    data: {
      customerId,
      kind: "ADJUSTMENT",
      amount: input.amount,
      reason: input.reason,
      createdById: userId,
    },
  });
  await audit(tx, {
    action: "CREATE",
    actorUserId: userId,
    entityType: ENTITY,
    entityId: note.id,
    after: note,
  });
  await recomputeAccount(tx, customerId);
  return note;
}

/**
 * Anula una nota de crédito (queda en el historial, deja de bajar la deuda).
 * Lo que se había reingresado al depósito se saca otra vez; lo que se dio de
 * baja no se toca (ya no estaba). El stock puede quedar negativo si ya se
 * vendió: es un saldo a revisar, no un error.
 */
export async function voidCreditNote(
  tx: Prisma.TransactionClient,
  noteId: string,
  reason: string,
  userId: string,
) {
  const current = await tx.customerCreditNote.findUnique({
    where: { id: noteId },
    select: { customerId: true },
  });
  if (!current) throw new CreditNoteError("notFound");
  await lockAccount(tx, current.customerId);

  // Releída con la cuenta bloqueada: dos anulaciones a la vez no pasan.
  const before = await tx.customerCreditNote.findUniqueOrThrow({
    where: { id: noteId },
    include: { items: true },
  });
  if (before.voidedAt) throw new CreditNoteError("alreadyVoided");

  const after = await tx.customerCreditNote.update({
    where: { id: noteId },
    data: { voidedAt: new Date(), voidedById: userId, voidReason: reason },
  });
  if (before.kind === "RETURN" && before.warehouseId) {
    const warehouseId = before.warehouseId;
    await recordCreditNoteMovements(
      tx,
      before,
      "CUSTOMER_RETURN_REVERSAL",
      before.items
        .filter((item) => item.destination === "RESTOCK")
        .map((item) => ({
          productId: item.productId,
          warehouseId,
          quantity: fromMilli(-toMilli(item.quantity)),
        })),
      userId,
    );
  }
  await audit(tx, {
    action: "UPDATE",
    actorUserId: userId,
    entityType: ENTITY,
    entityId: noteId,
    before: { voidedAt: null },
    after: { voidedAt: after.voidedAt, voidReason: after.voidReason },
  });
  await recomputeAccount(tx, current.customerId);
  return after;
}
