import { ReturnDestination, type SaleState } from "@/generated/prisma/enums";
import type { Dictionary } from "@/i18n/dictionaries/es";
import { CHARGED_SALE_STATES } from "./account";
import { cartTotals, parseCartQuantity } from "./cart";
import { parseDecimalInput, PRICE_LIMITS } from "./decimal-input";
import { fromMilli, toMilli } from "./quantity";

// Pure: customer credit notes. A return comes from a delivered order
// (products, quantities and what is done with each); an adjustment is only
// an amount. The amount of a return is what the customer paid for
// it (order price and tax rate), not today's price.

export const CREDIT_NOTE_REASON_MAX_LENGTH = 300;

type Messages = Dictionary["customerCreditNotes"]["errors"];
type Numeric = { toString(): string } | string;

/** Only returned from a delivered order (that is when it became a debt). */
export function isReturnable(state: SaleState): boolean {
  return CHARGED_SALE_STATES.includes(state);
}

/** An order line with what was already returned, to offer what is left. */
export type ReturnableLine = {
  productId: string;
  /** Delivered (already with the shortages deducted). */
  quantity: Numeric;
  /** Already returned in valid credit notes. */
  returned: Numeric;
  unitPrice: Numeric;
  unitTaxRate: Numeric;
  allowsDecimals: boolean;
};

/** What can still be returned of a line ("2.5"), never negative. */
export function remainingQuantity(line: {
  quantity: Numeric;
  returned: Numeric;
}): string {
  const left = toMilli(line.quantity) - toMilli(line.returned);
  return fromMilli(left > BigInt(0) ? left : BigInt(0));
}

/** Total (with VAT) of what was returned: order price and tax rate, to cents. */
export function returnAmount(
  lines: { quantity: Numeric; unitPrice: Numeric; unitTaxRate: Numeric }[],
): string {
  return cartTotals(
    lines.map((line) => ({
      price: line.unitPrice,
      rate: line.unitTaxRate,
      quantity: line.quantity,
      weight: "0",
    })),
  ).total;
}

export type ReturnInput = {
  warehouseId: string;
  reason: string;
  lines: {
    productId: string;
    quantity: string;
    destination: ReturnDestination;
  }[];
};

function read(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Reads the return form: `warehouse`, `reason` and, for each product,
 * `qty_<id>` (empty or 0 = not returned) and `dest_<id>`. Validates against what
 * can be returned now; the action validates it again with the account locked.
 */
export function parseReturn(
  formData: FormData,
  lines: ReturnableLine[],
  t: Messages,
): { ok: true; data: ReturnInput } | { ok: false; error: string } {
  const warehouseId = read(formData, "warehouse");
  if (!warehouseId) return { ok: false, error: t.warehouse };
  const reason = read(formData, "reason");
  if (!reason) return { ok: false, error: t.reasonRequired };
  if (reason.length > CREDIT_NOTE_REASON_MAX_LENGTH) {
    return { ok: false, error: t.reasonTooLong };
  }

  const parsed: ReturnInput["lines"] = [];
  for (const line of lines) {
    const raw = read(formData, `qty_${line.productId}`);
    if (!raw || /^0+([.,]0*)?$/.test(raw)) continue;
    const quantity = parseCartQuantity(raw, line.allowsDecimals);
    if (!quantity || toMilli(quantity) > toMilli(remainingQuantity(line))) {
      return { ok: false, error: t.quantity };
    }
    const destination = read(formData, `dest_${line.productId}`);
    if (!(Object.values(ReturnDestination) as string[]).includes(destination)) {
      return { ok: false, error: t.destination };
    }
    parsed.push({
      productId: line.productId,
      quantity,
      destination: destination as ReturnDestination,
    });
  }
  if (parsed.length === 0) return { ok: false, error: t.noLines };
  return { ok: true, data: { warehouseId, reason, lines: parsed } };
}

export type AdjustmentInput = { amount: string; reason: string };

/** Credit note by amount: amount greater than 0 (with VAT) and a reason. */
export function parseAdjustment(
  formData: FormData,
  t: Messages,
): { ok: true; data: AdjustmentInput } | { ok: false; error: string } {
  const amount = parseDecimalInput(read(formData, "amount"), PRICE_LIMITS);
  if (amount === null || Number(amount) <= 0) {
    return { ok: false, error: t.amount };
  }
  const reason = read(formData, "reason");
  if (!reason) return { ok: false, error: t.reasonRequired };
  if (reason.length > CREDIT_NOTE_REASON_MAX_LENGTH) {
    return { ok: false, error: t.reasonTooLong };
  }
  return { ok: true, data: { amount, reason } };
}
