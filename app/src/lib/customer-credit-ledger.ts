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

/** A credit note that cannot be made or voided, with the reason. */
export class CreditNoteError extends Error {
  constructor(
    readonly code: "notFound" | "notReturnable" | "quantity" | "alreadyVoided",
  ) {
    super(code);
  }
}

const ENTITY = "CUSTOMER_CREDIT_NOTE" as const;

/**
 * Return of goods from a delivered order: creates the credit note
 * with the order's price and tax rate snapshot, puts what was returned back into the
 * warehouse (what is written off comes in and goes out in the same act, so it stays in
 * the ledger) and recalculates the account. Lock order: the customer's account and
 * then the order, like payments and status changes.
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

  // With the account locked: two returns at once do not both pass what was delivered.
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

  // Everything returned comes in; what is not usable is written off right away.
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

/** Credit note by amount (discount or adjustment): no goods or stock. */
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
 * Voids a credit note (it stays in the history, stops lowering the debt).
 * What had been put back into the warehouse is removed again; what was written off
 * is not touched (it was no longer there). Stock can end up negative if it was
 * already sold: it is a balance to review, not an error.
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

  // Re-read with the account locked: two voids at once do not both pass.
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
