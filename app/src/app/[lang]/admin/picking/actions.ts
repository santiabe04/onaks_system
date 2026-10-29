"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Prisma } from "@/generated/prisma/client";
import { interpolate } from "@/i18n/config";
import { getActionDictionary } from "@/i18n/dictionary";
import { audit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { isCuid } from "@/lib/ids";
import { applyShortages } from "@/lib/partial-delivery-ledger";
import {
  parsePicked,
  parsePickingRequest,
  parsePreparer,
  pickingComment,
} from "@/lib/picking";
import {
  applySaleStateChange,
  StateChangeError,
} from "@/lib/sale-state-change";
import type { StateChangeInput } from "@/lib/sale-state-form";

// Listas de picking: al armarla los pedidos Pendientes pasan a En preparación
// (descuenta el stock del depósito de la lista); al confirmarla, a Listo para
// despachar, con los faltantes ajustados en el pedido y el stock. Anularla o
// sacar un pedido lo devuelve a Pendiente. Orden de bloqueo: la lista,
// después cada pedido (cuenta del cliente y pedido), ordenados por cliente.
const PERMISSION = "sales:manage";
const ENTITY = "PICKING_LIST";

export type PickingActionState = { error?: string };

/** Corta la transacción con un mensaje para el admin. */
class PickingError extends Error {}

function messages() {
  const t = getActionDictionary();
  return { picking: t.picking.errors, state: t.adminOrders.stateChange.errors };
}

async function run(
  work: () => Promise<void>,
): Promise<PickingActionState | null> {
  try {
    await work();
    return null;
  } catch (error) {
    if (error instanceof PickingError) return { error: error.message };
    throw error;
  }
}

function revalidateOrders() {
  revalidatePath("/[lang]/admin", "layout");
}

type SaleRef = { id: string; number: number; customerId: string };

/** Por cliente y pedido, como la salida de una hoja: no se cruzan bloqueos. */
function byCustomer<T extends SaleRef>(sales: T[]): T[] {
  return [...sales].sort(
    (a, b) =>
      a.customerId.localeCompare(b.customerId) || a.id.localeCompare(b.id),
  );
}

/** Cambia el estado de un pedido de la lista; un error corta todo con su número. */
async function changeState(
  tx: Prisma.TransactionClient,
  sale: SaleRef,
  input: Omit<StateChangeInput, "itemWarehouses" | "comment">,
  comment: string,
  userId: string,
) {
  const t = messages();
  try {
    await applySaleStateChange(
      tx,
      sale.id,
      { ...input, itemWarehouses: {}, comment },
      userId,
      t.state,
    );
  } catch (error) {
    if (!(error instanceof StateChangeError)) throw error;
    throw new PickingError(
      interpolate(t.picking.failed, {
        number: sale.number,
        error: error.message,
      }),
    );
  }
}

/** Bloquea una lista abierta y la devuelve con sus pedidos. */
async function lockOpenList(tx: Prisma.TransactionClient, listId: string) {
  const t = messages().picking;
  if (!isCuid(listId)) throw new PickingError(t.notFound);
  const [row] = await tx.$queryRaw<{ state: string }[]>`
    SELECT "state" FROM "picking_lists" WHERE "id" = ${listId} FOR UPDATE`;
  if (!row) throw new PickingError(t.notFound);
  if (row.state !== "OPEN") throw new PickingError(t.notOpen);
  const list = await tx.pickingList.findUniqueOrThrow({
    where: { id: listId },
    include: {
      items: {
        include: {
          sale: {
            select: {
              id: true,
              number: true,
              state: true,
              address: { select: { customerId: true } },
            },
          },
          product: {
            select: { measurementUnit: { select: { allowsDecimals: true } } },
          },
        },
      },
    },
  });
  const sales = new Map<string, SaleRef & { state: string }>();
  for (const item of list.items) {
    sales.set(item.saleId, {
      id: item.sale.id,
      number: item.sale.number,
      customerId: item.sale.address.customerId,
      state: item.sale.state,
    });
  }
  return { list, sales: [...sales.values()] };
}

/** Lista nueva con los pedidos elegidos: pasan a En preparación desde el depósito. */
export async function createPickingList(
  _prev: PickingActionState,
  formData: FormData,
): Promise<PickingActionState> {
  const user = await requirePermission(PERMISSION);
  const t = messages().picking;
  const request = parsePickingRequest(formData, t);
  if (!request.ok) return { error: request.error };

  let number = 0;
  const failed = await run(() =>
    db.$transaction(
      async (tx) => {
        const warehouse = await tx.warehouse.findFirst({
          where: { id: request.data.warehouseId, isActive: true },
          select: { id: true, name: true },
        });
        if (!warehouse) throw new PickingError(t.warehouse);
        const found = await tx.sale.findMany({
          where: { id: { in: request.data.saleIds } },
          select: {
            id: true,
            number: true,
            state: true,
            address: { select: { customerId: true } },
          },
        });
        const notPending = found.find((sale) => sale.state !== "PENDING");
        if (notPending) {
          throw new PickingError(
            interpolate(t.notPending, { number: notPending.number }),
          );
        }
        if (found.length === 0) throw new PickingError(t.noSales);

        const sales = byCustomer(
          found.map((sale) => ({
            id: sale.id,
            number: sale.number,
            customerId: sale.address.customerId,
          })),
        );
        const list = await tx.pickingList.create({
          data: {
            warehouseId: warehouse.id,
            notes: request.data.notes,
            createdById: user.id,
          },
        });
        for (const sale of sales) {
          await changeState(
            tx,
            sale,
            { from: "PENDING", to: "PREPARING", warehouseId: warehouse.id },
            `Picking #${list.number}`,
            user.id,
          );
        }
        // Lo que hay que sacar: los productos de cada pedido (foto al armarla).
        const items = await tx.saleItem.findMany({
          where: { saleId: { in: sales.map((sale) => sale.id) } },
          select: { saleId: true, productId: true, quantity: true },
        });
        await tx.pickingListItem.createMany({
          data: items.map((item) => ({ ...item, pickingListId: list.id })),
        });
        await audit(tx, {
          action: "CREATE",
          actorUserId: user.id,
          entityType: ENTITY,
          entityId: list.id,
          after: { ...list, sales: sales.map((sale) => sale.number) },
        });
        number = list.number;
      },
      // Muchos pedidos con sus movimientos de stock: más que el timeout por defecto.
      { timeout: 30_000 },
    ),
  );
  if (failed) return failed;
  revalidateOrders();
  redirect(`/admin/picking/${number}`);
}

/**
 * Confirma lo preparado: los faltantes ajustan el pedido y el stock
 * (`applyShortages`) y los pedidos pasan a Listo para despachar.
 */
export async function confirmPickingList(
  listId: string,
  _prev: PickingActionState,
  formData: FormData,
): Promise<PickingActionState> {
  const user = await requirePermission(PERMISSION);
  const t = messages().picking;
  const preparer = parsePreparer(formData, t);
  if (!preparer.ok) return { error: preparer.error };

  const failed = await run(() =>
    db.$transaction(
      async (tx) => {
        const { list, sales } = await lockOpenList(tx, listId);
        const picked = parsePicked(
          formData,
          list.items.map((item) => ({
            saleId: item.saleId,
            saleNumber: item.sale.number,
            productId: item.productId,
            quantity: item.quantity,
            allowsDecimals: item.product.measurementUnit.allowsDecimals,
          })),
          t,
        );
        if (!picked.ok) throw new PickingError(picked.error);

        for (const sale of byCustomer(sales)) {
          // Primero el estado (bloquea cuenta y pedido), después los faltantes.
          await changeState(
            tx,
            sale,
            { from: "PREPARING", to: "READY_TO_SHIP", warehouseId: null },
            `Picking #${list.number}`,
            user.id,
          );
          const shortages = picked.shortages.get(sale.id) ?? [];
          await applyShortages(
            tx,
            sale,
            {
              comment: pickingComment(list.number, sale.number),
              metadata: { picking: list.number, shortages },
            },
            shortages,
            user.id,
          );
        }
        for (const line of picked.lines) {
          await tx.pickingListItem.update({
            where: {
              pickingListId_saleId_productId: {
                pickingListId: list.id,
                saleId: line.saleId,
                productId: line.productId,
              },
            },
            data: { picked: line.picked, shortageReason: line.reason },
          });
        }
        const after = await tx.pickingList.update({
          where: { id: list.id },
          data: {
            state: "PREPARED",
            preparer: preparer.preparer,
            confirmedAt: new Date(),
            confirmedById: user.id,
          },
        });
        await audit(tx, {
          action: "UPDATE",
          actorUserId: user.id,
          entityType: ENTITY,
          entityId: list.id,
          before: { state: list.state },
          after: {
            state: after.state,
            preparer: after.preparer,
            picked: picked.lines,
          },
        });
      },
      { timeout: 30_000 },
    ),
  );
  if (failed) return failed;
  revalidateOrders();
  return {};
}

/** Devuelve un pedido de la lista a Pendiente (si sigue En preparación). */
async function releaseSale(
  tx: Prisma.TransactionClient,
  sale: SaleRef & { state: string },
  listNumber: number,
  userId: string,
) {
  // Si alguien ya le cambió el estado a mano, solo se quita de la lista.
  if (sale.state !== "PREPARING") return;
  await changeState(
    tx,
    sale,
    { from: "PREPARING", to: "PENDING", warehouseId: null },
    `Picking #${listNumber}`,
    userId,
  );
}

/** Anula la lista: sus pedidos vuelven a Pendiente y se devuelve el stock. */
export async function cancelPickingList(
  listId: string,
): Promise<PickingActionState> {
  const user = await requirePermission(PERMISSION);
  const failed = await run(() =>
    db.$transaction(
      async (tx) => {
        const { list, sales } = await lockOpenList(tx, listId);
        for (const sale of byCustomer(sales)) {
          await releaseSale(tx, sale, list.number, user.id);
        }
        const after = await tx.pickingList.update({
          where: { id: list.id },
          data: { state: "CANCELED", canceledAt: new Date() },
        });
        await audit(tx, {
          action: "UPDATE",
          actorUserId: user.id,
          entityType: ENTITY,
          entityId: list.id,
          before: { state: list.state },
          after: { state: after.state },
        });
      },
      { timeout: 30_000 },
    ),
  );
  if (failed) return failed;
  revalidateOrders();
  return {};
}

/** Saca un pedido de la lista abierta y lo devuelve a Pendiente. */
export async function removePickingSale(
  listId: string,
  saleId: string,
): Promise<PickingActionState> {
  const user = await requirePermission(PERMISSION);
  const t = messages().picking;
  const failed = await run(() =>
    db.$transaction(async (tx) => {
      const { list, sales } = await lockOpenList(tx, listId);
      const sale = sales.find((row) => row.id === saleId);
      if (!sale) throw new PickingError(t.notFound);
      if (sales.length === 1) throw new PickingError(t.lastOrder);
      await releaseSale(tx, sale, list.number, user.id);
      await tx.pickingListItem.deleteMany({
        where: { pickingListId: list.id, saleId: sale.id },
      });
      await audit(tx, {
        action: "UPDATE",
        actorUserId: user.id,
        entityType: ENTITY,
        entityId: list.id,
        before: { sales: sales.map((row) => row.number) },
        after: {
          sales: sales
            .filter((row) => row.id !== sale.id)
            .map((row) => row.number),
        },
      });
    }),
  );
  if (failed) return failed;
  revalidateOrders();
  return {};
}
