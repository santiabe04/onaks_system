"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Prisma } from "@/generated/prisma/client";
import type { PurchaseOrderState } from "@/generated/prisma/enums";
import { getActionDictionary } from "@/i18n/dictionary";
import { audit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth";
import { cartTotals } from "@/lib/cart";
import { db } from "@/lib/db";
import { isCuid } from "@/lib/ids";
import { lockPurchaseOrder } from "@/lib/purchase-lock";
import {
  parsePurchaseHeader,
  parsePurchaseLines,
  PO_CANCELABLE,
} from "@/lib/purchase-order";

// Purchase orders: they are built as drafts, marked as sent, and canceled
// as long as nothing has arrived (receipts are entered by the receiving reports).
const PERMISSION = "purchases:manage";
const ENTITY = "PURCHASE_ORDER";

export type PurchaseActionState = { error?: string; savedAt?: number };

/** Aborts the transaction with a message for the admin. */
class PurchaseError extends Error {}

function messages() {
  return getActionDictionary().purchases.errors;
}

async function run(
  work: () => Promise<void>,
): Promise<PurchaseActionState | null> {
  try {
    await work();
    return null;
  } catch (error) {
    if (error instanceof PurchaseError) return { error: error.message };
    throw error;
  }
}

function revalidatePurchases() {
  revalidatePath("/[lang]/admin", "layout");
}

/** Locks the PO until the end of the transaction and returns it. */
async function lockOrder(tx: Prisma.TransactionClient, orderId: string) {
  const order = await lockPurchaseOrder(tx, orderId);
  if (!order) throw new PurchaseError(messages().notFound);
  return order;
}

/** Something received (through the receiving reports) prevents canceling or going back. */
async function hasReceived(tx: Prisma.TransactionClient, orderId: string) {
  const received = await tx.purchaseOrderItem.count({
    where: { purchaseOrderId: orderId, receivedQuantity: { gt: 0 } },
  });
  return received > 0;
}

/** New draft for a supplier; it is completed on its screen. */
export async function createPurchaseOrder(
  _prev: PurchaseActionState,
  formData: FormData,
): Promise<PurchaseActionState> {
  const user = await requirePermission(PERMISSION);
  const t = messages();
  const supplierId = formData.get("supplierId");
  if (!isCuid(supplierId)) return { error: t.supplier };

  let number = 0;
  const failed = await run(() =>
    db.$transaction(async (tx) => {
      const supplier = await tx.supplier.findFirst({
        where: { id: supplierId, isActive: true },
        select: { id: true },
      });
      if (!supplier) throw new PurchaseError(t.supplier);
      const order = await tx.purchaseOrder.create({
        data: { supplierId, createdById: user.id, updatedById: user.id },
      });
      await audit(tx, {
        action: "CREATE",
        actorUserId: user.id,
        entityType: ENTITY,
        entityId: order.id,
        after: order,
      });
      number = order.number;
    }),
  );
  if (failed) return failed;
  revalidatePurchases();
  redirect(`/admin/purchases/${number}`);
}

/**
 * Saves the draft: expected date, comment and lines (quantity and net
 * cost). The VAT rate is taken from the product at this moment (snapshot).
 */
export async function savePurchaseOrder(
  orderId: string,
  _prev: PurchaseActionState,
  formData: FormData,
): Promise<PurchaseActionState> {
  const user = await requirePermission(PERMISSION);
  const t = messages();
  const header = parsePurchaseHeader(formData, t);
  if (!header.ok) return { error: header.error };

  const failed = await run(() =>
    db.$transaction(async (tx) => {
      const order = await lockOrder(tx, orderId);
      if (order.state !== "DRAFT") throw new PurchaseError(t.notDraft);
      const supplied = await tx.supplierProduct.findMany({
        where: { supplierId: order.supplierId, product: { deletedAt: null } },
        select: {
          productId: true,
          product: {
            select: {
              taxRate: { select: { rate: true } },
              measurementUnit: { select: { allowsDecimals: true } },
            },
          },
        },
      });
      const parsed = parsePurchaseLines(
        formData,
        supplied.map((item) => ({
          productId: item.productId,
          allowsDecimals: item.product.measurementUnit.allowsDecimals,
        })),
        t,
      );
      if (!parsed.ok) throw new PurchaseError(parsed.error);

      const rate = (productId: string) =>
        supplied.find((item) => item.productId === productId)!.product.taxRate
          .rate;
      const totals = cartTotals(
        parsed.lines.map((line) => ({
          price: line.unitCost,
          rate: rate(line.productId),
          quantity: line.quantity,
          weight: "0",
        })),
      );
      const before = await tx.purchaseOrder.findUniqueOrThrow({
        where: { id: order.id },
        include: { items: true },
      });
      await tx.purchaseOrderItem.deleteMany({
        where: { purchaseOrderId: order.id },
      });
      const after = await tx.purchaseOrder.update({
        where: { id: order.id },
        data: {
          expectedDate: header.data.expectedDate
            ? new Date(`${header.data.expectedDate}T00:00:00Z`)
            : null,
          notes: header.data.notes,
          subTotal: totals.net,
          tax: totals.tax,
          total: totals.total,
          updatedById: user.id,
          items: {
            create: parsed.lines.map((line) => ({
              productId: line.productId,
              quantity: line.quantity,
              unitCost: line.unitCost,
              taxRate: rate(line.productId),
            })),
          },
        },
        include: { items: true },
      });
      await audit(tx, {
        action: "UPDATE",
        actorUserId: user.id,
        entityType: ENTITY,
        entityId: order.id,
        before,
        after,
      });
    }),
  );
  if (failed) return failed;
  revalidatePurchases();
  return { savedAt: Date.now() };
}

/** Simple status change (send, back to draft, cancel), audited. */
async function changeState(
  orderId: string,
  check: (
    tx: Prisma.TransactionClient,
    order: { id: string; state: PurchaseOrderState },
  ) => Promise<void>,
  data: Prisma.PurchaseOrderUpdateInput,
): Promise<PurchaseActionState> {
  const user = await requirePermission(PERMISSION);
  const failed = await run(() =>
    db.$transaction(async (tx) => {
      const order = await lockOrder(tx, orderId);
      await check(tx, order);
      const after = await tx.purchaseOrder.update({
        where: { id: order.id },
        data: { ...data, updatedBy: { connect: { id: user.id } } },
      });
      await audit(tx, {
        action: "UPDATE",
        actorUserId: user.id,
        entityType: ENTITY,
        entityId: order.id,
        before: { state: order.state },
        after: { state: after.state },
      });
    }),
  );
  if (failed) return failed;
  revalidatePurchases();
  return {};
}

/** Sent to the supplier (by email or WhatsApp): it is recorded as ordered. */
export async function sendPurchaseOrder(
  orderId: string,
): Promise<PurchaseActionState> {
  const t = messages();
  return changeState(
    orderId,
    async (tx, order) => {
      if (order.state !== "DRAFT") throw new PurchaseError(t.notDraft);
      const lines = await tx.purchaseOrderItem.count({
        where: { purchaseOrderId: order.id },
      });
      if (lines === 0) throw new PurchaseError(t.noLines);
    },
    { state: "SENT", sentAt: new Date() },
  );
}

/** To correct it, as long as nothing has arrived. */
export async function backToDraft(
  orderId: string,
): Promise<PurchaseActionState> {
  const t = messages();
  return changeState(
    orderId,
    async (tx, order) => {
      if (order.state !== "SENT") throw new PurchaseError(t.notCancelable);
      if (await hasReceived(tx, order.id)) {
        throw new PurchaseError(t.notCancelable);
      }
    },
    { state: "DRAFT", sentAt: null },
  );
}

export async function cancelPurchaseOrder(
  orderId: string,
): Promise<PurchaseActionState> {
  const t = messages();
  return changeState(
    orderId,
    async (tx, order) => {
      if (!PO_CANCELABLE.includes(order.state)) {
        throw new PurchaseError(t.notCancelable);
      }
      if (await hasReceived(tx, order.id)) {
        throw new PurchaseError(t.notCancelable);
      }
    },
    { state: "CANCELED", canceledAt: new Date() },
  );
}
