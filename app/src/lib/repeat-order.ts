import { fromMilli, toMilli } from "./quantity";

// Puro: qué se suma al carrito al repetir un pedido. Los precios no se copian:
// el carrito siempre usa los de hoy (lista y descuento del cliente).

type Numeric = { toString(): string } | string;

const SCALE = BigInt(1000);
const ZERO = BigInt(0);

export type RepeatLine = {
  productId: string;
  /** Lo que se pidió (`sale_items.quantity`, hasta 4 decimales). */
  quantity: Numeric;
  /** Si el producto se puede comprar hoy (activo y no borrado). */
  available: boolean;
  /** Si su unidad admite fracciones hoy (puede haber cambiado). */
  allowsDecimals: boolean;
};

export type RepeatPlan = {
  adds: { productId: string; quantity: string }[];
  /** Productos que ya no se pueden comprar y no se suman. */
  omitted: number;
};

/**
 * Cantidad para el carrito: a milésimas (el carrito guarda 3 decimales) y, si
 * la unidad ya no admite fracciones, redondeada hacia arriba: pidió al menos
 * eso. null si no queda nada que sumar.
 */
export function repeatQuantity(
  quantity: Numeric,
  allowsDecimals: boolean,
): string | null {
  let milli = toMilli(quantity);
  if (milli <= ZERO) return null;
  if (!allowsDecimals && milli % SCALE !== ZERO) {
    milli = ((milli + SCALE - BigInt(1)) / SCALE) * SCALE;
  }
  return fromMilli(milli);
}

/** Qué sumar al carrito y cuántos productos quedan afuera. */
export function planRepeat(lines: RepeatLine[]): RepeatPlan {
  const adds: RepeatPlan["adds"] = [];
  let omitted = 0;
  for (const line of lines) {
    const quantity = line.available
      ? repeatQuantity(line.quantity, line.allowsDecimals)
      : null;
    if (quantity === null) omitted += 1;
    else adds.push({ productId: line.productId, quantity });
  }
  return { adds, omitted };
}
