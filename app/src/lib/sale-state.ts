import type { SaleState } from "@/generated/prisma/enums";
import { fromMilli, toMilli } from "./quantity";

// Pure: which status changes are allowed and what happens to the stock.

/** An order's path. Canceled is kept apart. */
export const SALE_FLOW = [
  "PENDING",
  "PREPARING",
  "READY_TO_SHIP",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "FINISHED",
] as const satisfies readonly SaleState[];

const PREPARING = SALE_FLOW.indexOf("PREPARING");
const DELIVERED = SALE_FLOW.indexOf("DELIVERED");

function step(state: SaleState): number {
  return (SALE_FLOW as readonly SaleState[]).indexOf(state);
}

/**
 * Where an order can go: forward (skipping steps if needed),
 * one step back to correct, or to Canceled as long as it was not delivered.
 * Canceled is final.
 */
export function allowedTransitions(state: SaleState): SaleState[] {
  const current = step(state);
  if (current === -1) return [];
  const targets: SaleState[] = [];
  if (current > 0) targets.push(SALE_FLOW[current - 1]);
  targets.push(...SALE_FLOW.slice(current + 1));
  if (current < DELIVERED) targets.push("CANCELED");
  return targets;
}

export function canTransition(from: SaleState, to: SaleState): boolean {
  return allowedTransitions(from).includes(to);
}

/** Whether the order has its stock deducted in that status (from In preparation onwards). */
export function hasStockDeducted(state: SaleState): boolean {
  return step(state) >= PREPARING;
}

/**
 * What to do with the stock when changing status: deduct it on reaching In
 * preparation (or later, if steps are skipped) and return it on going back to
 * Pending or canceling after it was deducted.
 */
export function stockEffect(
  from: SaleState,
  to: SaleState,
): "deduct" | "return" | null {
  const before = hasStockDeducted(from);
  const after = hasStockDeducted(to);
  if (!before && after) return "deduct";
  if (before && !after) return "return";
  return null;
}

/** Whether going back to `to` is a step back (to warn about it in the UI). */
export function isStepBack(from: SaleState, to: SaleState): boolean {
  return step(to) !== -1 && step(to) < step(from);
}

/**
 * What has to be returned to each warehouse: the net of the order's
 * movements (negative deductions, positive returns). This way an order that
 * was prepared, went back and was prepared again returns only what is missing.
 */
export function pendingReturns(
  movements: {
    productId: string;
    warehouseId: string;
    quantity: { toString(): string };
  }[],
): { productId: string; warehouseId: string; quantity: string }[] {
  const net = new Map<
    string,
    { productId: string; warehouseId: string; milli: bigint }
  >();
  for (const movement of movements) {
    const key = `${movement.productId}|${movement.warehouseId}`;
    const entry = net.get(key) ?? {
      productId: movement.productId,
      warehouseId: movement.warehouseId,
      milli: BigInt(0),
    };
    entry.milli += toMilli(movement.quantity);
    net.set(key, entry);
  }
  return [...net.values()]
    .filter((entry) => entry.milli < BigInt(0))
    .map((entry) => ({
      productId: entry.productId,
      warehouseId: entry.warehouseId,
      quantity: fromMilli(-entry.milli),
    }));
}
