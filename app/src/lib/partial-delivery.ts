import type { Dictionary } from "@/i18n/dictionaries/es";
import { parseDecimalInput } from "./decimal-input";
import { fromMilli, QUANTITY_LIMITS, toMilli } from "./quantity";

// Puro: entrega parcial de una parada. Por producto, cuánto se entregó y,
// si faltó algo, el motivo (que decide qué pasa con el stock).

/**
 * RETURNED: vuelve en la camioneta (rechazado, sobrante) → vuelve al depósito.
 * WRITTEN_OFF: se rompió o venció → se da de baja.
 */
export const SHORTAGE_REASONS = ["RETURNED", "WRITTEN_OFF"] as const;
export type ShortageReason = (typeof SHORTAGE_REASONS)[number];

type Numeric = { toString(): string } | string;

export type OrderedItem = {
  productId: string;
  quantity: Numeric;
  allowsDecimals: boolean;
};

export type Shortage = {
  productId: string;
  /** Cantidades normalizadas ("2", "1.25"). */
  ordered: string;
  delivered: string;
  missing: string;
  reason: ShortageReason;
};

type Messages = Dictionary["delivery"]["errors"];

/**
 * Lee la entrega parcial del form (`partial`, `delivered_<producto>`,
 * `reason_<producto>`). Sin `partial`, o si al final se entregó todo, no hay
 * faltantes. Algo tiene que haberse entregado: si no, es "No entregado".
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
    if (!SHORTAGE_REASONS.includes(reason as ShortageReason)) {
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

/** Las cantidades del pedido después de la entrega parcial (0 = se quita). */
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
