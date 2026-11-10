import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { PurchaseOrderState } from "@/generated/prisma/enums";
import { isCuid } from "./ids";

export type LockedPurchaseOrder = {
  id: string;
  number: number;
  supplierId: string;
  state: PurchaseOrderState;
};

/**
 * Locks the PO until the end of the transaction and returns it (null if it
 * does not exist). Purchase orders and receiving reports lock it first.
 */
export async function lockPurchaseOrder(
  tx: Prisma.TransactionClient,
  orderId: unknown,
): Promise<LockedPurchaseOrder | null> {
  if (!isCuid(orderId)) return null;
  const [order] = await tx.$queryRaw<LockedPurchaseOrder[]>`
    SELECT "id", "number", "supplier_id" AS "supplierId", "state"
    FROM "purchase_orders" WHERE "id" = ${orderId} FOR UPDATE`;
  return order ?? null;
}
