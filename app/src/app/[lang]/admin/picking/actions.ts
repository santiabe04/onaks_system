"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Prisma } from "@/generated/prisma/client";
import { interpolate } from "@/i18n/config";
import { getActionDictionary } from "@/i18n/dictionary";
import { audit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { parseDecimalInput } from "@/lib/decimal-input";
import { isCuid } from "@/lib/ids";
import { QUANTITY_LIMITS } from "@/lib/quantity";
import { applyShortages } from "@/lib/partial-delivery-ledger";
import { reassignSaleLot, StockLedgerError } from "@/lib/stock-ledger";
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

// Picking lists: when created, the Pending orders move to In preparation
// (deducting stock from the list's warehouse); when confirmed, to Ready to ship,
// with the shortages adjusted on the order and the stock. Canceling it or
// removing an order sends it back to Pending. Lock order: the list,
// then each order (customer account and order), sorted by customer.
const PERMISSION = "sales:manage";
const ENTITY = "PICKING_LIST";

export type PickingActionState = { error?: string };

/** Aborts the transaction with a message for the admin. */
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

/** By customer and order, like the departure from a route sheet: no crossed locks. */
function byCustomer<T extends SaleRef>(sales: T[]): T[] {
  return [...sales].sort(
    (a, b) =>
      a.customerId.localeCompare(b.customerId) || a.id.localeCompare(b.id),
  );
}

/** Changes the status of an order on the list; an error aborts everything with its number. */
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

/** Locks an open list and returns it with its orders. */
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

/** New list with the chosen orders: they move to In preparation from the warehouse. */
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
        // What has to be taken out: each order's products (snapshot when built).
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
      // Many orders with their stock movements: more than the default timeout.
      { timeout: 30_000 },
    ),
  );
  if (failed) return failed;
  revalidateOrders();
  redirect(`/admin/picking/${number}`);
}

/**
 * Confirms what was prepared: the shortages adjust the order and the stock
 * (`applyShortages`) and the orders move to Ready to ship.
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
          // First the status (locks account and order), then the shortages.
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

/** Returns an order on the list to Pending (if it is still In preparation). */
async function releaseSale(
  tx: Prisma.TransactionClient,
  sale: SaleRef & { state: string },
  listNumber: number,
  userId: string,
) {
  // If someone already changed its status by hand, it is only removed from the list.
  if (sale.state !== "PREPARING") return;
  await changeState(
    tx,
    sale,
    { from: "PREPARING", to: "PENDING", warehouseId: null },
    `Picking #${listNumber}`,
    userId,
  );
}

/** Cancels the list: its orders go back to Pending and the stock is returned. */
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

/** Removes an order from the open list and returns it to Pending. */
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

/**
 * Changes the lot that an order's goods come from on an open list (the FEFO
 * suggestion was not what was on the shelf). The product's stock does not
 * change: it moves between lots with two movements of the order.
 */
export async function changePickingLot(
  listId: string,
  _prev: PickingActionState,
  formData: FormData,
): Promise<PickingActionState> {
  const user = await requirePermission(PERMISSION);
  const t = messages().picking;
  const read = (key: string) => {
    const value = formData.get(key);
    return typeof value === "string" ? value.trim() : "";
  };
  const [saleId, productId, fromLotId, toLotId] = [
    read("saleId"),
    read("productId"),
    read("fromLotId"),
    read("toLotId"),
  ];
  const quantity = parseDecimalInput(read("quantity"), QUANTITY_LIMITS);
  if (
    quantity === null ||
    ![saleId, productId, fromLotId, toLotId].every(isCuid)
  ) {
    return { error: t.lotInvalid };
  }
  const failed = await run(async () => {
    try {
      await db.$transaction(async (tx) => {
        const { list, sales } = await lockOpenList(tx, listId);
        const sale = sales.find((row) => row.id === saleId);
        const inList = list.items.some(
          (item) => item.saleId === saleId && item.productId === productId,
        );
        if (!sale || !inList) throw new PickingError(t.notFound);
        await reassignSaleLot(
          tx,
          sale,
          {
            productId,
            warehouseId: list.warehouseId,
            fromLotId,
            toLotId,
            quantity,
          },
          user.id,
        );
      });
    } catch (error) {
      if (error instanceof StockLedgerError) {
        throw new PickingError(t.lotInvalid);
      }
      throw error;
    }
  });
  if (failed) return failed;
  revalidateOrders();
  return {};
}
