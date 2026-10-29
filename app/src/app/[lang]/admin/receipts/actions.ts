"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Prisma } from "@/generated/prisma/client";
import { getActionDictionary } from "@/i18n/dictionary";
import { audit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  orderStateFor,
  parseReason,
  parseReceiptHeader,
  parseReceiptLines,
  pendingQuantity,
  RECEIVABLE_PO_STATES,
} from "@/lib/goods-receipt";
import { isCuid } from "@/lib/ids";
import { lockPurchaseOrder } from "@/lib/purchase-lock";
import { fromMilli, toMilli } from "@/lib/quantity";
import { recordReceiptMovements, StockLedgerError } from "@/lib/stock-ledger";

// Informes de recepción (IR): lo que llegó de una OC entra al stock de un
// depósito y suma a lo recibido de la OC. Se anulan con motivo (revierten
// todo). Orden de bloqueo: la OC, después el informe, después los saldos.
const PERMISSION = "purchases:manage";

export type ReceiptActionState = { error?: string };

/** Corta la transacción con un mensaje para el admin. */
class ReceiptError extends Error {}

function messages() {
  return getActionDictionary().receipts.errors;
}

async function run(
  work: () => Promise<void>,
): Promise<ReceiptActionState | null> {
  try {
    await work();
    return null;
  } catch (error) {
    if (error instanceof ReceiptError) return { error: error.message };
    if (error instanceof StockLedgerError) {
      return { error: messages().warehouseInactive };
    }
    throw error;
  }
}

function revalidatePurchases() {
  revalidatePath("/[lang]/admin", "layout");
}

async function lockOrder(tx: Prisma.TransactionClient, orderId: unknown) {
  const order = await lockPurchaseOrder(tx, orderId);
  if (!order) throw new ReceiptError(messages().orderNotFound);
  return order;
}

/**
 * Nuevo estado de la OC con lo recibido actualizado, auditado. Al anular un
 * informe se reabre si estaba cerrada con faltante.
 */
async function updateOrderReceived(
  tx: Prisma.TransactionClient,
  order: { id: string; state: string },
  changes: Map<string, bigint>,
  userId: string,
) {
  const items = await tx.purchaseOrderItem.findMany({
    where: { purchaseOrderId: order.id },
    select: { productId: true, quantity: true, receivedQuantity: true },
  });
  const updated = items.map((item) => {
    const delta = changes.get(item.productId) ?? BigInt(0);
    const received = toMilli(item.receivedQuantity) + delta;
    return {
      ...item,
      receivedQuantity: fromMilli(received > BigInt(0) ? received : BigInt(0)),
    };
  });
  for (const item of updated) {
    if (!changes.has(item.productId)) continue;
    await tx.purchaseOrderItem.update({
      where: {
        purchaseOrderId_productId: {
          purchaseOrderId: order.id,
          productId: item.productId,
        },
      },
      data: { receivedQuantity: item.receivedQuantity },
    });
  }
  const state = orderStateFor(updated);
  await tx.purchaseOrder.update({
    where: { id: order.id },
    data: { state, closedAt: null, closeNote: null, updatedById: userId },
  });
  await audit(tx, {
    action: "UPDATE",
    actorUserId: userId,
    entityType: "PURCHASE_ORDER",
    entityId: order.id,
    before: {
      state: order.state,
      items: items.map(({ productId, receivedQuantity }) => ({
        productId,
        receivedQuantity,
      })),
    },
    after: {
      state,
      items: updated.map(({ productId, receivedQuantity }) => ({
        productId,
        receivedQuantity,
      })),
    },
  });
}

/** Carga lo que llegó de una OC: ingresa el stock y actualiza la OC. */
export async function createGoodsReceipt(
  orderId: string,
  _prev: ReceiptActionState,
  formData: FormData,
): Promise<ReceiptActionState> {
  const user = await requirePermission(PERMISSION);
  const t = messages();
  const header = parseReceiptHeader(formData, t);
  if (!header.ok) return { error: header.error };

  let number = 0;
  const failed = await run(() =>
    db.$transaction(async (tx) => {
      const order = await lockOrder(tx, orderId);
      if (!RECEIVABLE_PO_STATES.includes(order.state)) {
        throw new ReceiptError(t.notReceivable);
      }
      const items = await tx.purchaseOrderItem.findMany({
        where: { purchaseOrderId: order.id },
        select: {
          productId: true,
          quantity: true,
          receivedQuantity: true,
          product: {
            select: { measurementUnit: { select: { allowsDecimals: true } } },
          },
        },
      });
      const parsed = parseReceiptLines(
        formData,
        items.map((item) => ({
          productId: item.productId,
          allowsDecimals: item.product.measurementUnit.allowsDecimals,
        })),
        t,
      );
      if (!parsed.ok) throw new ReceiptError(parsed.error);
      const warehouse = await tx.warehouse.findFirst({
        where: { id: header.data.warehouseId, isActive: true },
        select: { id: true },
      });
      if (!warehouse) throw new ReceiptError(t.warehouse);

      const item = (productId: string) =>
        items.find((row) => row.productId === productId)!;
      const receipt = await tx.goodsReceipt.create({
        data: {
          purchaseOrderId: order.id,
          warehouseId: warehouse.id,
          deliveryNote: header.data.deliveryNote,
          notes: header.data.notes,
          createdById: user.id,
          items: {
            create: parsed.lines.map((line) => ({
              productId: line.productId,
              quantity: line.quantity,
              pending: pendingQuantity(item(line.productId)),
            })),
          },
        },
        include: { items: true },
      });
      await audit(tx, {
        action: "CREATE",
        actorUserId: user.id,
        entityType: "GOODS_RECEIPT",
        entityId: receipt.id,
        after: receipt,
      });
      await recordReceiptMovements(
        tx,
        { id: receipt.id, number: receipt.number, orderNumber: order.number },
        "PURCHASE_RECEIPT",
        parsed.lines.map((line) => ({
          productId: line.productId,
          warehouseId: warehouse.id,
          quantity: line.quantity,
        })),
        user.id,
      );
      await updateOrderReceived(
        tx,
        order,
        new Map(
          parsed.lines.map((line) => [line.productId, toMilli(line.quantity)]),
        ),
        user.id,
      );
      number = receipt.number;
    }),
  );
  if (failed) return failed;
  revalidatePurchases();
  redirect(`/admin/receipts/${number}`);
}

/** Anula un informe: saca el stock que ingresó y lo descuenta de la OC. */
export async function annulGoodsReceipt(
  receiptId: string,
  _prev: ReceiptActionState,
  formData: FormData,
): Promise<ReceiptActionState> {
  const user = await requirePermission(PERMISSION);
  const t = messages();
  const reason = parseReason(formData, t);
  if (!reason.ok) return { error: reason.error };
  if (!isCuid(receiptId)) return { error: t.notFound };

  const failed = await run(() =>
    db.$transaction(async (tx) => {
      const found = await tx.goodsReceipt.findUnique({
        where: { id: receiptId },
        select: { purchaseOrderId: true },
      });
      if (!found) throw new ReceiptError(t.notFound);
      const order = await lockOrder(tx, found.purchaseOrderId);
      const [receipt] = await tx.$queryRaw<
        { id: string; number: number; state: string; warehouseId: string }[]
      >`SELECT "id", "number", "state", "warehouse_id" AS "warehouseId"
        FROM "goods_receipts" WHERE "id" = ${receiptId} FOR UPDATE`;
      if (receipt.state === "ANNULLED") {
        throw new ReceiptError(t.alreadyAnnulled);
      }
      const items = await tx.goodsReceiptItem.findMany({
        where: { goodsReceiptId: receipt.id },
        select: { productId: true, quantity: true },
      });

      await recordReceiptMovements(
        tx,
        { id: receipt.id, number: receipt.number, orderNumber: order.number },
        "PURCHASE_RECEIPT_REVERSAL",
        items.map((item) => ({
          productId: item.productId,
          warehouseId: receipt.warehouseId,
          quantity: fromMilli(-toMilli(item.quantity)),
        })),
        user.id,
      );
      await updateOrderReceived(
        tx,
        order,
        new Map(items.map((item) => [item.productId, -toMilli(item.quantity)])),
        user.id,
      );
      const after = await tx.goodsReceipt.update({
        where: { id: receipt.id },
        data: {
          state: "ANNULLED",
          annulledAt: new Date(),
          annulReason: reason.reason,
          annulledById: user.id,
        },
      });
      await audit(tx, {
        action: "UPDATE",
        actorUserId: user.id,
        entityType: "GOODS_RECEIPT",
        entityId: receipt.id,
        before: { state: receipt.state },
        after: { state: after.state, annulReason: after.annulReason },
      });
    }),
  );
  if (failed) return failed;
  revalidatePurchases();
  return {};
}

/**
 * Da por terminada una OC recibida en parte: queda Recibida y lo que falta
 * deja de contarse como pedido (no se espera más mercadería).
 */
export async function closePurchaseOrderShort(
  orderId: string,
  _prev: ReceiptActionState,
  formData: FormData,
): Promise<ReceiptActionState> {
  const user = await requirePermission(PERMISSION);
  const t = messages();
  const reason = parseReason(formData, t);
  if (!reason.ok) return { error: reason.error };

  const failed = await run(() =>
    db.$transaction(async (tx) => {
      const order = await lockOrder(tx, orderId);
      if (order.state !== "PARTIALLY_RECEIVED") {
        throw new ReceiptError(t.notPartial);
      }
      const after = await tx.purchaseOrder.update({
        where: { id: order.id },
        data: {
          state: "RECEIVED",
          closedAt: new Date(),
          closeNote: reason.reason,
          updatedById: user.id,
        },
      });
      await audit(tx, {
        action: "UPDATE",
        actorUserId: user.id,
        entityType: "PURCHASE_ORDER",
        entityId: order.id,
        before: { state: order.state },
        after: { state: after.state, closeNote: after.closeNote },
      });
    }),
  );
  if (failed) return failed;
  revalidatePurchases();
  return {};
}
