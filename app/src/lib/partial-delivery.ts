import type { Dictionary } from "@/i18n/dictionaries/es";
import { parseDecimalInput } from "./decimal-input";
import { fromMilli, QUANTITY_LIMITS, toMilli } from "./quantity";

// Pure: partial delivery of a stop. Per product, how much was delivered and,
// if something was missing, the reason (which decides what happens to the stock).

/**
 * RETURNED: comes back on the truck (rejected, surplus) → goes back to the warehouse.
 * WRITTEN_OFF: broken or expired → written off.
 */
export const SHORTAGE_REASONS = ["RETURNED", "WRITTEN_OFF"] as const;
/**
 * In picking: MISSING (not in the warehouse → stock adjustment) or
 * WRITTEN_OFF (broken or expired → write-off).
 */
export const PICKING_SHORTAGE_REASONS = ["MISSING", "WRITTEN_OFF"] as const;
export type ShortageReason =
  (typeof SHORTAGE_REASONS)[number] | (typeof PICKING_SHORTAGE_REASONS)[number];

type Numeric = { toString(): string } | string;

export type OrderedItem = {
  productId: string;
  quantity: Numeric;
  allowsDecimals: boolean;
};

export type Shortage = {
  productId: string;
  /** Normalized quantities ("2", "1.25"). */
  ordered: string;
  delivered: string;
  missing: string;
  reason: ShortageReason;
};

type Messages = Dictionary["delivery"]["errors"];

/**
 * Reads the partial delivery from the form (`partial`, `delivered_<product>`,
 * `reason_<product>`). Without `partial`, or if in the end everything was delivered, there are no
 * shortages. Something must have been delivered: otherwise it is "Not delivered".
 */
export function parsePartialDelivery(
  formData: FormData,
  items: OrderedItem[],
  t: Messages,
): { ok: true; shortages: Shortage[] } | { ok: false; error: string } {
  if (formData.get("partial") !== "on") return { ok: true, shortages: [] };

  const shortages: Shortage[] = [];
  let deliveredAny = false;
  for (const item of items) {
    const ordered = toMilli(item.quantity);
    const raw = formData.get(`delivered_${item.productId}`);
    const text = typeof raw === "string" ? raw.trim() : "";
    const parsed = parseDecimalInput(text, {
      ...QUANTITY_LIMITS,
      maxDecimals: item.allowsDecimals ? QUANTITY_LIMITS.maxDecimals : 0,
    });
    if (parsed === null) return { ok: false, error: t.deliveredQuantity };
    const delivered = toMilli(parsed);
    if (delivered > ordered) return { ok: false, error: t.deliveredTooMuch };
    if (delivered > BigInt(0)) deliveredAny = true;
    if (delivered === ordered) continue;

    const reason = formData.get(`reason_${item.productId}`);
    if (
      !SHORTAGE_REASONS.includes(reason as (typeof SHORTAGE_REASONS)[number])
    ) {
      return { ok: false, error: t.shortageReason };
    }
    shortages.push({
      productId: item.productId,
      ordered: fromMilli(ordered),
      delivered: fromMilli(delivered),
      missing: fromMilli(ordered - delivered),
      reason: reason as ShortageReason,
    });
  }
  if (!deliveredAny) return { ok: false, error: t.nothingDelivered };
  return { ok: true, shortages };
}

/** The order's quantities after the partial delivery (0 = removed). */
export function deliveredQuantities(
  items: { productId: string; quantity: Numeric }[],
  shortages: Shortage[],
): { productId: string; quantity: string }[] {
  return items.map((item) => {
    const shortage = shortages.find((s) => s.productId === item.productId);
    return {
      productId: item.productId,
      quantity: shortage
        ? shortage.delivered
        : fromMilli(toMilli(item.quantity)),
    };
  });
}
