"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@/generated/prisma/client";
import { interpolate } from "@/i18n/config";
import { getActionDictionary } from "@/i18n/dictionary";
import { audit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { isCuid } from "@/lib/ids";
import { fromMilli, toMilli } from "@/lib/quantity";
import {
  applyCountEntry,
  countDifference,
  matchProductByCode,
  parseCountEntry,
  parseCountRequest,
  quantityFitsUnit,
} from "@/lib/stock-count";
import { recordStockCorrection, StockLedgerError } from "@/lib/stock-ledger";

// Inventory count: it is opened per warehouse (one open at a time), entered
// by scanning (blind: what is shown is the counted quantity, not the balance), and an admin
// approves it. The scans are a draft until approved: on approval, each
// difference (counted − balance at the first scan) is recorded as an adjustment and
// everything is kept in the audit log. Counting: `stock:count`; approving and discarding: `stock:manage`.
// `stock:manage`.
const ENTITY = "STOCK_COUNT";

export type CountActionState = {
  error?: string;
  /** Last product loaded, with what has been counted so far. */
  added?: { name: string; counted: string; unit: string };
};

/** Aborts the transaction with a message for whoever is counting. */
class CountError extends Error {}

function messages() {
  return getActionDictionary().stockCount.errors;
}

function revalidateCounts() {
  revalidatePath("/[lang]/admin/stock", "layout");
}

async function run<T>(
  work: () => Promise<T>,
): Promise<{ value: T } | { error: string }> {
  try {
    return { value: await work() };
  } catch (error) {
    if (error instanceof CountError) return { error: error.message };
    throw error;
  }
}

/** Locks an open count (so a scan does not overwrite an approval). */
async function lockOpenCount(
  tx: Prisma.TransactionClient,
  countId: string,
): Promise<{ id: string; number: number; warehouseId: string }> {
  const t = messages();
  if (!isCuid(countId)) throw new CountError(t.notFound);
  const [row] = await tx.$queryRaw<
    { id: string; number: number; warehouseId: string; state: string }[]
  >`
    SELECT "id", "number", "warehouse_id" AS "warehouseId", "state"
    FROM "stock_counts" WHERE "id" = ${countId} FOR UPDATE`;
  if (!row) throw new CountError(t.notFound);
  if (row.state !== "OPEN") throw new CountError(t.notOpen);
  return row;
}

/** Opens a warehouse's count and goes in to load it. */
export async function createStockCount(
  _prev: CountActionState,
  formData: FormData,
): Promise<CountActionState> {
  const user = await requirePermission("stock:count");
  const t = messages();
  const request = parseCountRequest(formData, t);
  if (!request.ok) return { error: request.error };

  const result = await run(() =>
    db.$transaction(async (tx) => {
      const warehouse = await tx.warehouse.findFirst({
        where: { id: request.data.warehouseId, isActive: true },
        select: { id: true },
      });
      if (!warehouse) throw new CountError(t.warehouse);
      const open = await tx.stockCount.findFirst({
        where: { warehouseId: warehouse.id, state: "OPEN" },
        select: { number: true },
      });
      if (open) {
        throw new CountError(
          interpolate(t.alreadyOpen, { number: open.number }),
        );
      }
      const count = await tx.stockCount.create({
        data: {
          warehouseId: warehouse.id,
          notes: request.data.notes,
          createdById: user.id,
        },
      });
      await audit(tx, {
        action: "CREATE",
        actorUserId: user.id,
        entityType: ENTITY,
        entityId: count.id,
        after: count,
      });
      return count.number;
    }),
  ).catch((error: unknown) => {
    // Two open counts at once: stopped by the partial unique index.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { error: t.alreadyOpenNow };
    }
    throw error;
  });
  if ("error" in result) return { error: result.error };
  revalidateCounts();
  redirect(`/admin/stock/counts/${result.value}`);
}

/** Loads a scan: adds (or sets) the counted quantity of a product by barcode or SKU. */
export async function scanCountEntry(
  countId: string,
  _prev: CountActionState,
  formData: FormData,
): Promise<CountActionState> {
  await requirePermission("stock:count");
  const t = messages();
  const entry = parseCountEntry(formData, t);
  if (!entry.ok) return { error: entry.error };

  const result = await run(() =>
    db.$transaction(async (tx) => {
      const count = await lockOpenCount(tx, countId);
      const candidates = await tx.product.findMany({
        where: {
          deletedAt: null,
          OR: [
            { barcode: entry.data.code },
            { sku: entry.data.code.toUpperCase() },
          ],
        },
        select: {
          id: true,
          name: true,
          sku: true,
          barcode: true,
          measurementUnit: {
            select: { name: true, allowsDecimals: true },
          },
        },
      });
      const product = matchProductByCode(entry.data.code, candidates);
      if (!product) throw new CountError(t.unknownCode);
      if (
        !quantityFitsUnit(
          entry.data.quantity,
          product.measurementUnit.allowsDecimals,
        )
      ) {
        throw new CountError(t.wholeUnits);
      }
      const current = await tx.stockCountItem.findUnique({
        where: {
          stockCountId_productId: {
            stockCountId: count.id,
            productId: product.id,
          },
        },
      });
      const counted = applyCountEntry(
        current ? current.counted.toString() : null,
        entry.data,
      );
      if (toMilli(counted) > toMilli("999999999.999")) {
        throw new CountError(t.quantity);
      }
      if (current) {
        await tx.stockCountItem.update({
          where: {
            stockCountId_productId: {
              stockCountId: count.id,
              productId: product.id,
            },
          },
          data: { counted },
        });
      } else {
        // The system balance at this first scan: the difference is measured against it.
        const stock = await tx.productStock.findUnique({
          where: {
            productId_warehouseId: {
              productId: product.id,
              warehouseId: count.warehouseId,
            },
          },
          select: { quantity: true },
        });
        await tx.stockCountItem.create({
          data: {
            stockCountId: count.id,
            productId: product.id,
            counted,
            expected: stock ? stock.quantity.toString() : "0",
          },
        });
      }
      return {
        name: product.name,
        counted,
        unit: product.measurementUnit.name,
      };
    }),
  );
  if ("error" in result) return { error: result.error };
  revalidateCounts();
  return { added: result.value };
}

/** Removes a product from the count (it was counted wrong or should not be adjusted). */
export async function removeCountEntry(
  countId: string,
  productId: string,
): Promise<void> {
  await requirePermission("stock:count");
  if (!isCuid(productId)) return;
  const result = await run(() =>
    db.$transaction(async (tx) => {
      const count = await lockOpenCount(tx, countId);
      await tx.stockCountItem.deleteMany({
        where: { stockCountId: count.id, productId },
      });
    }),
  );
  if ("error" in result) return;
  revalidateCounts();
}

/** Discards the count: it does not move stock. */
export async function cancelStockCount(
  countId: string,
): Promise<CountActionState> {
  const user = await requirePermission("stock:manage");
  const result = await run(() =>
    db.$transaction(async (tx) => {
      const count = await lockOpenCount(tx, countId);
      const after = await tx.stockCount.update({
        where: { id: count.id },
        data: { state: "CANCELED", canceledAt: new Date() },
      });
      await audit(tx, {
        action: "UPDATE",
        actorUserId: user.id,
        entityType: ENTITY,
        entityId: count.id,
        before: { state: "OPEN" },
        after: { state: after.state },
      });
    }),
  );
  if ("error" in result) return { error: result.error };
  revalidateCounts();
  redirect("/admin/stock/counts");
}

/**
 * Approves the count: each difference is recorded as a stock adjustment (all
 * or nothing). The difference is counted − balance at the first scan, so what
 * was sold or received while counting is not overwritten.
 */
export async function approveStockCount(
  countId: string,
): Promise<CountActionState> {
  const user = await requirePermission("stock:manage");
  const t = messages();
  const result = await run(() =>
    db.$transaction(
      async (tx) => {
        const count = await lockOpenCount(tx, countId);
        const items = await tx.stockCountItem.findMany({
          where: { stockCountId: count.id },
          orderBy: { productId: "asc" },
        });
        if (items.length === 0) throw new CountError(t.empty);
        const applied: { productId: string; difference: string }[] = [];
        // Always in the same order (by product): locks do not cross.
        for (const item of items) {
          const difference = countDifference(
            item.counted.toString(),
            item.expected.toString(),
          );
          if (toMilli(difference) !== BigInt(0)) {
            try {
              await recordStockCorrection(
                tx,
                {
                  productId: item.productId,
                  warehouseId: count.warehouseId,
                  // "Shortage" with a sign: a surplus enters as a negative shortage.
                  missing: fromMilli(-toMilli(difference)),
                },
                `Conteo #${count.number}`,
                user.id,
              );
            } catch (error) {
              if (error instanceof StockLedgerError) {
                throw new CountError(t.warehouse);
              }
              throw error;
            }
          }
          await tx.stockCountItem.update({
            where: {
              stockCountId_productId: {
                stockCountId: count.id,
                productId: item.productId,
              },
            },
            data: { applied: difference },
          });
          applied.push({ productId: item.productId, difference });
        }
        const after = await tx.stockCount.update({
          where: { id: count.id },
          data: {
            state: "APPROVED",
            approvedAt: new Date(),
            approvedById: user.id,
          },
        });
        await audit(tx, {
          action: "UPDATE",
          actorUserId: user.id,
          entityType: ENTITY,
          entityId: count.id,
          before: { state: "OPEN" },
          after: { state: after.state, adjustments: applied },
        });
      },
      // Many products with their movement and audit: more than the default timeout.
      { timeout: 60_000 },
    ),
  );
  if ("error" in result) return { error: result.error };
  revalidateCounts();
  return {};
}
