import { parseDecimalInput } from "./decimal-input";
import { fromMilli, QUANTITY_LIMITS, toMilli } from "./quantity";

// Pure: cart quantities and order totals. Everything in integers (BigInt)
// to avoid floating-point errors with money.

type Numeric = { toString(): string } | string;

/**
 * "2", "1,5" → normalized quantity, or null if it is not valid: greater than 0, with
 * up to 3 decimals if the unit allows them (kg, liters) and whole if not ("u").
 */
export function parseCartQuantity(
  raw: string,
  allowsDecimals: boolean,
): string | null {
  const parsed = parseDecimalInput(raw, {
    ...QUANTITY_LIMITS,
    maxDecimals: allowsDecimals ? QUANTITY_LIMITS.maxDecimals : 0,
  });
  if (parsed === null || toMilli(parsed) <= BigInt(0)) return null;
  return fromMilli(toMilli(parsed));
}

export type CartLine = {
  /** Unit net price. */
  price: Numeric;
  /** Tax rate as a fraction (0.105). */
  rate: Numeric;
  quantity: Numeric;
  /** Unit weight in kg. */
  weight: Numeric;
};

export type LineTotals = { net: string; tax: string; total: string };

export type CartTotals = LineTotals & { weight: string };

const ZERO = BigInt(0);
const HALF_MILLI = BigInt(500);
const MILLI = BigInt(1000);
const HALF_RATE = BigInt(5000);
const RATE_SCALE = BigInt(10_000);
const HUNDRED = BigInt(100);

/** a / b rounded half up (a and b positive). */
function divRound(a: bigint, b: bigint, half: bigint): bigint {
  return (a + half) / b;
}

function cents(value: Numeric): bigint {
  const [integer, decimals = ""] = String(value.toString()).split(".");
  return BigInt(integer + decimals.padEnd(2, "0").slice(0, 2));
}

function basisPoints(rate: Numeric): bigint {
  const [integer, decimals = ""] = String(rate.toString()).split(".");
  return BigInt(integer + decimals.padEnd(4, "0").slice(0, 4));
}

function money(value: bigint): string {
  const fraction = String(value % HUNDRED).padStart(2, "0");
  return `${value / HUNDRED}.${fraction}`;
}

function lineCents(line: CartLine) {
  // Line net = price × quantity, to cents; the VAT is calculated on
  // that net. So what is stored in the order matches what was shown.
  const net = divRound(
    cents(line.price) * toMilli(line.quantity),
    MILLI,
    HALF_MILLI,
  );
  const tax = divRound(net * basisPoints(line.rate), RATE_SCALE, HALF_RATE);
  return { net, tax };
}

export function lineTotals(line: CartLine): LineTotals {
  const { net, tax } = lineCents(line);
  return { net: money(net), tax: money(tax), total: money(net + tax) };
}

/** Cart totals (and order totals): sum of the already rounded lines. */
export function cartTotals(lines: CartLine[]): CartTotals {
  let net = ZERO;
  let tax = ZERO;
  let weight = ZERO;
  for (const line of lines) {
    const totals = lineCents(line);
    net += totals.net;
    tax += totals.tax;
    weight += divRound(
      toMilli(line.weight) * toMilli(line.quantity),
      MILLI,
      HALF_MILLI,
    );
  }
  return {
    net: money(net),
    tax: money(tax),
    total: money(net + tax),
    weight: fromMilli(weight),
  };
}
