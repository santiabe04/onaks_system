// Pure: final price from the net and the tax rate. Used by the server (lists)
// and the form (preview), so it does not depend on Prisma's Decimal.

type Numeric = string | number | { toString(): string };

// BigInt(...) and not `10_000n` literals: the tsconfig target is older than ES2020.
const SCALE = BigInt(10_000); // 4 decimals of the tax rate
const HALF = BigInt(5_000);
const HUNDRED = BigInt(100);

/** "1234.5" → 123450n (cents, or the scale requested). */
function toScaled(value: Numeric, scale: number): bigint {
  const [integer, decimals = ""] = String(value.toString()).split(".");
  return BigInt(integer + decimals.padEnd(scale, "0").slice(0, scale));
}

/**
 * Final price = net × (1 + tax rate), rounded to cents (half up).
 * With integers: no floating-point errors in money.
 */
export function finalPrice(net: Numeric, rate: Numeric): string {
  const cents = toScaled(net, 2);
  const basisPoints = toScaled(rate, 4); // 0.105 → 1050
  const rounded = (cents * (SCALE + basisPoints) + HALF) / SCALE;
  const whole = rounded / HUNDRED;
  const fraction = String(rounded % HUNDRED).padStart(2, "0");
  return `${whole}.${fraction}`;
}
