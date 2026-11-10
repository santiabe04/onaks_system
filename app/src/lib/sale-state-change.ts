import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { SaleState } from "@/generated/prisma/enums";
import type { Dictionary } from "@/i18n/dictionaries/es";
import { CHARGED_SALE_STATES } from "./account";
import { lockAccount, recomputeAccount } from "./account-ledger";
import { audit } from "./audit";
import { fromMilli, toMilli } from "./quantity";
import { noticeFor } from "./order-notice";
import { enqueueOrderNotice } from "./order-notice-ledger";
import { canTransition, pendingReturns, stockEffect } from "./sale-state";
import { resolveWarehouses, type StateChangeInput } from "./sale-state-form";
import { recordSaleMovements, StockLedgerError } from "./stock-ledger";

type Messages = Dictionary["adminOrders"]["stateChange"]["errors"];

/** A status change that cannot be made, with the message for the admin. */
export class StateChangeError extends Error {}

/**
 * Changes the status of an order inside the transaction it receives (used
 * by the individual and the bulk change). On reaching In preparation it deducts the
 * stock from the chosen warehouses; on going back to Pending or canceling later,
 * it returns it to where it came from. Recalculates the customer's account.
 */
export async function applySaleStateChange(
  tx: Prisma.TransactionClient,
  saleId: string,
  input: StateChangeInput,
  userId: string,
  t: Messages,
): Promise<void> {
  // First the customer's account and then the order, in the same order
  // as the payments: so two transactions do not block each other.
  const owner = await tx.sale.findUnique({
    where: { id: saleId },
    select: { address: { select: { customerId: true } } },
  });
  if (!owner) throw new StateChangeError(t.notFound);
  const customerId = owner.address.customerId;
  await lockAccount(tx, customerId);

  // Locked until the end: two changes at once do not deduct twice.
  const [locked] = await tx.$queryRaw<
    { state: SaleState; number: number; editing: boolean; held: boolean }[]
  >`SELECT "state", "number", "editing_person_id" IS NOT NULL AS "editing",
      ("credit_hold_at" IS NOT NULL AND "credit_released_at" IS NULL) AS "held"
    FROM "sales" WHERE "id" = ${saleId} FOR UPDATE`;
  if (!locked) throw new StateChangeError(t.notFound);
  if (locked.state !== input.from) throw new StateChangeError(t.stale);
  // Its products are in the customer's cart: it is not touched until they confirm.
  if (locked.editing) throw new StateChangeError(t.beingEdited);
  // Held for credit: it can only be canceled until it is approved.
  if (locked.held && input.to !== "CANCELED") {
    throw new StateChangeError(t.creditHold);
  }
  if (!canTransition(locked.state, input.to)) {
    throw new StateChangeError(t.notAllowed);
  }
  const sale = { id: saleId, number: locked.number };

  const effect = stockEffect(locked.state, input.to);
  let stock: Record<string, unknown> | undefined;
  try {
    if (effect === "deduct") {
      const items = await tx.saleItem.findMany({
        where: { saleId },
        select: { productId: true, quantity: true },
      });
      const warehouses = resolveWarehouses(
        items.map((item) => item.productId),
        input,
      );
      if (!warehouses) throw new StateChangeError(t.warehouseRequired);
      const lines = items.map((item) => ({
        productId: item.productId,
        warehouseId: warehouses[item.productId],
        // sale_items stores 4 decimals; stock, 3.
        quantity: fromMilli(-toMilli(item.quantity)),
      }));
      await recordSaleMovements(tx, sale, "SALE", lines, userId);
      stock = { deducted: lines };
    } else if (effect === "return") {
      const movements = await tx.stockMovement.findMany({
        where: { saleId },
        select: { productId: true, warehouseId: true, quantity: true },
      });
      const lines = pendingReturns(movements);
      await recordSaleMovements(tx, sale, "SALE_RETURN", lines, userId);
      stock = { returned: lines };
    }
  } catch (error) {
    if (error instanceof StockLedgerError) {
      throw new StateChangeError(t.warehouseInactive);
    }
    throw error;
  }

  await tx.sale.update({
    where: { id: saleId },
    data: {
      state: input.to,
      // The edit permission is only for Pending orders.
      customerCanEdit: false,
      // Sale date for the reports: on delivery; it is cleared if it goes back.
      deliveredAt: CHARGED_SALE_STATES.includes(input.to)
        ? CHARGED_SALE_STATES.includes(locked.state)
          ? undefined
          : new Date()
        : null,
    },
  });
  await audit(tx, {
    action: "UPDATE",
    actorUserId: userId,
    entityType: "SALE",
    entityId: saleId,
    before: { state: locked.state },
    after: { state: input.to },
    metadata: { comment: input.comment, ...stock },
  });
  // Delivering (or going back) changes the debt and the payment status.
  await recomputeAccount(tx, customerId);
  // Notifies the customer by email (forward, to the statuses that are notified).
  const event = noticeFor(locked.state, input.to);
  if (event) await enqueueOrderNotice(tx, sale, event);
}
