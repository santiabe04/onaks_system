import { lineTotals } from "./cart";

// Pure: the net price each customer pays. Used by the server (catalog,
// cart, orders) and by the admin's order-entry form. In integers.

type Numeric = { toString(): string } | string;

/** What defines a customer's price. */
export type Pricing = {
  /** Adjustment of their list over the base price, as a fraction (0 with no list). */
  adjustment: string;
  /** The customer's own discount over their list price, as a fraction. */
  discount: string;
  /** Fixed net price per product in their list (overrides the adjustment). */
  overrides: Record<string, string>;
};

/** No list and no discount: the base price (admins, customers with no list). */
export const BASE_PRICING: Pricing = {
  adjustment: "0",
  discount: "0",
  overrides: {},
};

const SCALE = BigInt(10_000);
const HALF = BigInt(5_000);
const HUNDRED = BigInt(100);

function scaled(value: Numeric, digits: number): bigint {
  const raw = value.toString().trim();
  const negative = raw.startsWith("-");
  const [integer, decimals = ""] = raw.replace("-", "").split(".");
  const result = BigInt(
    integer + decimals.padEnd(digits, "0").slice(0, digits),
  );
  return negative ? -result : result;
}

function money(cents: bigint): string {
  return `${cents / HUNDRED}.${String(cents % HUNDRED).padStart(2, "0")}`;
}

/** price × (1 + fraction), rounded to cents (half up). */
function applyRate(price: Numeric, rate: bigint): string {
  return money((scaled(price, 2) * (SCALE + rate) + HALF) / SCALE);
}

/** The customer's list net price: the product's fixed price or base ± adjustment. */
export function listPrice(
  productId: string,
  basePrice: Numeric,
  pricing: Pricing,
): string {
  const fixed = pricing.overrides[productId];
  if (fixed !== undefined) return money(scaled(fixed, 2));
  return applyRate(basePrice, scaled(pricing.adjustment, 4));
}

/** Net price the customer pays: their list price minus their discount. */
export function customerPrice(
  productId: string,
  basePrice: Numeric,
  pricing: Pricing,
): string {
  return applyRate(
    listPrice(productId, basePrice, pricing),
    -scaled(pricing.discount, 4),
  );
}

/** Net discount of an order: what it would have cost at base price minus what it cost. */
export function saleDiscount(
  lines: { listPrice: Numeric; price: Numeric; quantity: Numeric }[],
): string {
  let cents = BigInt(0);
  for (const line of lines) {
    const base = lineTotals({
      ...line,
      price: line.listPrice,
      rate: "0",
      weight: "0",
    });
    const paid = lineTotals({ ...line, rate: "0", weight: "0" });
    cents += scaled(base.net, 2) - scaled(paid.net, 2);
  }
  return money(cents < BigInt(0) ? BigInt(0) : cents);
}
