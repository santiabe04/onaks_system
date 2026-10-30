import { lineTotals } from "./cart";

// Puro: el precio neto que paga cada cliente. Lo usan el server (catálogo,
// carrito, pedidos) y el form del pedido cargado por el admin. En enteros.

type Numeric = { toString(): string } | string;

/** Lo que define el precio de un cliente. */
export type Pricing = {
  /** Ajuste de su lista sobre el precio base, como fracción (0 sin lista). */
  adjustment: string;
  /** Descuento propio del cliente sobre el precio de su lista, como fracción. */
  discount: string;
  /** Precio neto fijo por producto en su lista (pisa el ajuste). */
  overrides: Record<string, string>;
};

/** Sin lista ni descuento: el precio base (admins, clientes sin lista). */
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

/** precio × (1 + fracción), redondeado a centavos (mitad hacia arriba). */
function applyRate(price: Numeric, rate: bigint): string {
  return money((scaled(price, 2) * (SCALE + rate) + HALF) / SCALE);
}

/** Precio neto de la lista del cliente: el fijo del producto o base ± ajuste. */
export function listPrice(
  productId: string,
  basePrice: Numeric,
  pricing: Pricing,
): string {
  const fixed = pricing.overrides[productId];
  if (fixed !== undefined) return money(scaled(fixed, 2));
  return applyRate(basePrice, scaled(pricing.adjustment, 4));
}

/** Precio neto que paga el cliente: el de su lista menos su descuento. */
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

/** Bonificación neta de un pedido: lo que hubiera costado a precio base menos lo que costó. */
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
