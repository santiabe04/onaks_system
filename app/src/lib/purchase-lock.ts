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
 * Bloquea la OC hasta el fin de la transacción y la devuelve (null si no
 * existe). Órdenes de compra e informes de recepción la bloquean primero.
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
