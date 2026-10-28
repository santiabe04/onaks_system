import { parseDecimalInput } from "./decimal-input";
import { fromMilli, QUANTITY_LIMITS, toMilli } from "./quantity";

// Puro: cantidades del carrito y totales del pedido. Todo en enteros (BigInt)
// para no tener errores de coma flotante en la plata.

type Numeric = { toString(): string } | string;

/**
 * "2", "1,5" → cantidad normalizada, o null si no es válida: mayor a 0, con
 * hasta 3 decimales si la unidad los admite (kg, litros) y entera si no ("u").
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
  /** Precio neto unitario. */
  price: Numeric;
  /** Alícuota como fracción (0.105). */
  rate: Numeric;
  quantity: Numeric;
  /** Peso unitario en kg. */
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

/** a / b redondeado a la mitad hacia arriba (a y b positivos). */
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
  // Neto de la línea = precio × cantidad, a centavos; el IVA se calcula sobre
  // ese neto. Así lo que se guarda en el pedido coincide con lo que se mostró.
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

/** Totales del carrito (y del pedido): suma de las líneas ya redondeadas. */
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
