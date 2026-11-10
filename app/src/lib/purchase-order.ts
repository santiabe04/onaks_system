import type { PurchaseOrderState } from "@/generated/prisma/enums";
import { interpolate } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/es";
import { parseDecimalInput } from "./decimal-input";
import { isoDay } from "./order-period";
import { fromMilli, QUANTITY_LIMITS, toMilli } from "./quantity";

// Pure: purchase orders (PO) to suppliers.

export const PO_NOTES_MAX_LENGTH = 300;
const MONEY_LIMITS = { maxDecimals: 2, maxIntegerDigits: 10 };
const MILLI = BigInt(1000);
const ZERO = BigInt(0);

type Numeric = { toString(): string } | string;

/** Only edited as a draft; it is canceled or goes back to draft as long as nothing has arrived. */
export const PO_EDITABLE: PurchaseOrderState[] = ["DRAFT"];
export const PO_CANCELABLE: PurchaseOrderState[] = ["DRAFT", "SENT"];

/**
 * How much to order: what is missing to reach the minimum and cover what is reserved by
 * orders, deducting the stock and what was already ordered on other POs not yet received. Without
 * decimals, rounded up (2.4 bags are not ordered).
 */
export function suggestQuantity(input: {
  minStock: Numeric | null;
  stock: Numeric;
  reserved: Numeric;
  onOrder: Numeric;
  allowsDecimals: boolean;
}): string {
  const needed =
    toMilli(input.minStock ?? "0") +
    toMilli(input.reserved) -
    toMilli(input.stock) -
    toMilli(input.onOrder);
  if (needed <= ZERO) return "0";
  if (input.allowsDecimals) return fromMilli(needed);
  return fromMilli(((needed + MILLI - BigInt(1)) / MILLI) * MILLI);
}

export type PurchaseLine = {
  productId: string;
  /** "12", "2.5". */
  quantity: string;
  /** Unit net cost ("1234.5"). */
  unitCost: string;
};

type Messages = Dictionary["purchases"]["errors"];

/**
 * The form lines (`qty_<product>`, `cost_<product>`): without a quantity (or
 * 0) the product is not included. With a quantity, the cost is mandatory.
 */
export function parsePurchaseLines(
  formData: FormData,
  products: { productId: string; allowsDecimals: boolean }[],
  t: Messages,
): { ok: true; lines: PurchaseLine[] } | { ok: false; error: string } {
  const read = (key: string) => {
    const value = formData.get(key);
    return typeof value === "string" ? value.trim() : "";
  };
  const lines: PurchaseLine[] = [];
  for (const product of products) {
    const rawQuantity = read(`qty_${product.productId}`);
    if (!rawQuantity) continue;
    const quantity = parseDecimalInput(rawQuantity, {
      ...QUANTITY_LIMITS,
      maxDecimals: product.allowsDecimals ? QUANTITY_LIMITS.maxDecimals : 0,
    });
    if (quantity === null) return { ok: false, error: t.quantity };
    if (toMilli(quantity) === ZERO) continue;
    const unitCost = parseDecimalInput(
      read(`cost_${product.productId}`),
      MONEY_LIMITS,
    );
    if (unitCost === null) return { ok: false, error: t.cost };
    lines.push({
      productId: product.productId,
      quantity: fromMilli(toMilli(quantity)),
      unitCost,
    });
  }
  return { ok: true, lines };
}

export type PurchaseHeader = {
  /** YYYY-MM-DD or null. */
  expectedDate: string | null;
  notes: string | null;
};

export function parsePurchaseHeader(
  formData: FormData,
  t: Messages,
): { ok: true; data: PurchaseHeader } | { ok: false; error: string } {
  const read = (key: string) => {
    const value = formData.get(key);
    return typeof value === "string" ? value.trim() : "";
  };
  const expectedDate = read("expectedDate");
  if (
    expectedDate &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(expectedDate) ||
      Number.isNaN(Date.parse(expectedDate)))
  ) {
    return { ok: false, error: t.expectedDate };
  }
  const notes = read("notes");
  if (notes.length > PO_NOTES_MAX_LENGTH) {
    return {
      ok: false,
      error: interpolate(t.tooLong, { max: PO_NOTES_MAX_LENGTH }),
    };
  }
  return {
    ok: true,
    data: { expectedDate: expectedDate || null, notes: notes || null },
  };
}

/**
 * The PO as text to send by WhatsApp: supplier, number, products with
 * the supplier's code and the expected date. Without prices: the supplier already
 * has them (and so it can be resent without exposing the agreed cost).
 */
export function purchaseOrderText(
  order: {
    number: number;
    supplierName: string;
    expectedDate: Date | null;
    notes: string | null;
    items: {
      name: string;
      supplierCode: string | null;
      quantity: string;
      unit: string;
    }[];
  },
  t: Dictionary["purchases"]["whatsapp"],
  formatDay: (day: string) => string,
): string {
  const lines = [
    interpolate(t.greeting, { supplier: order.supplierName }),
    interpolate(t.header, { number: order.number }),
    "",
    ...order.items.map(
      (item) =>
        `• ${item.quantity} ${item.unit} — ${item.name}${
          item.supplierCode ? ` (${item.supplierCode})` : ""
        }`,
    ),
  ];
  if (order.expectedDate) {
    lines.push(
      "",
      interpolate(t.expected, {
        date: formatDay(order.expectedDate.toISOString().slice(0, 10)),
      }),
    );
  }
  if (order.notes) lines.push("", order.notes);
  lines.push("", t.thanks);
  return lines.join("\n");
}

/** Today (Argentina) as YYYY-MM-DD, for the minimum of the date input. */
export function todayIso(now: Date = new Date()): string {
  return isoDay(now);
}
