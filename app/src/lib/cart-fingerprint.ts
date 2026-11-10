import { createHash } from "node:crypto";
import { toMilli } from "./quantity";

// Server only: uses node:crypto. It lives apart from lib/checkout, which the
// customer's form also imports.

type Numeric = { toString(): string } | string;

/** "25000" or a Decimal("25000.00") → "2500000" (with `digits` fixed decimals). */
function scaled(value: Numeric, digits: number): string {
  const [integer, decimals = ""] = value.toString().trim().split(".");
  return BigInt(
    integer + decimals.padEnd(digits, "0").slice(0, digits),
  ).toString();
}

export type FingerprintLine = {
  productId: string;
  quantity: Numeric;
  price: Numeric;
  rate: Numeric;
};

/**
 * Fingerprint of what the customer saw on confirmation: products, quantities, prices
 * and tax rates. If something changes between being shown and being confirmed (another price,
 * another tab that edited the cart), the confirmation is rejected.
 */
export function cartFingerprint(lines: FingerprintLine[]): string {
  const canonical = lines
    .map((line) =>
      [
        line.productId,
        toMilli(line.quantity).toString(),
        // Normalized: "25000" and "25000.00" are the same price.
        scaled(line.price, 2),
        scaled(line.rate, 4),
      ].join(":"),
    )
    .sort()
    .join("|");
  return createHash("sha256").update(canonical).digest("hex");
}
