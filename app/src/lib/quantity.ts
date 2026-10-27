import type { DecimalLimits } from "./decimal-input";

// Puro: cantidades de stock (DECIMAL(12,3)) como enteros en milésimas, para
// sumar y restar sin errores de coma flotante.

export const QUANTITY_LIMITS: DecimalLimits = {
  maxDecimals: 3,
  maxIntegerDigits: 9,
};

// BigInt(...) y no literales `1000n`: el target del tsconfig es anterior a ES2020.
const SCALE = BigInt(1000);
const ZERO = BigInt(0);

/** "12.5" o un Decimal ("-3.250") → 12500n / -3250n. */
export function toMilli(value: { toString(): string }): bigint {
  const text = value.toString().trim();
  const negative = text.startsWith("-");
  const [integer, decimals = ""] = text.replace(/^[-+]/, "").split(".");
  const milli =
    BigInt(integer || "0") * SCALE +
    BigInt(decimals.padEnd(3, "0").slice(0, 3));
  return negative ? -milli : milli;
}

/** 12500n → "12.5"; -3250n → "-3.25"; 0n → "0". Sin ceros de más. */
export function fromMilli(milli: bigint): string {
  const negative = milli < ZERO;
  const abs = negative ? -milli : milli;
  const integer = (abs / SCALE).toString();
  const decimals = (abs % SCALE).toString().padStart(3, "0").replace(/0+$/, "");
  return `${negative ? "-" : ""}${integer}${decimals ? `.${decimals}` : ""}`;
}
