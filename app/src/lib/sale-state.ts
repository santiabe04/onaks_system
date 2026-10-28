import type { SaleState } from "@/generated/prisma/enums";
import { fromMilli, toMilli } from "./quantity";

// Puro: qué cambios de estado se permiten y qué pasa con el stock.

/** El recorrido de un pedido. Cancelado queda aparte. */
export const SALE_FLOW = [
  "PENDING",
  "PREPARING",
  "READY_TO_SHIP",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "FINISHED",
] as const satisfies readonly SaleState[];

const PREPARING = SALE_FLOW.indexOf("PREPARING");
const DELIVERED = SALE_FLOW.indexOf("DELIVERED");

function step(state: SaleState): number {
  return (SALE_FLOW as readonly SaleState[]).indexOf(state);
}

/**
 * A dónde puede pasar un pedido: hacia adelante (salteando pasos si hace
 * falta), un paso atrás para corregir, o a Cancelado mientras no se entregó.
 * Cancelado es final.
 */
export function allowedTransitions(state: SaleState): SaleState[] {
  const current = step(state);
  if (current === -1) return [];
  const targets: SaleState[] = [];
  if (current > 0) targets.push(SALE_FLOW[current - 1]);
  targets.push(...SALE_FLOW.slice(current + 1));
  if (current < DELIVERED) targets.push("CANCELED");
  return targets;
}

export function canTransition(from: SaleState, to: SaleState): boolean {
  return allowedTransitions(from).includes(to);
}

/** Si el pedido tiene el stock descontado en ese estado (de En preparación en adelante). */
export function hasStockDeducted(state: SaleState): boolean {
  return step(state) >= PREPARING;
}

/**
 * Qué hacer con el stock al cambiar de estado: descontarlo al llegar a En
 * preparación (o más adelante, si se saltean pasos) y devolverlo al volver a
 * Pendiente o cancelar después de haberlo descontado.
 */
export function stockEffect(
  from: SaleState,
  to: SaleState,
): "deduct" | "return" | null {
  const before = hasStockDeducted(from);
  const after = hasStockDeducted(to);
  if (!before && after) return "deduct";
  if (before && !after) return "return";
  return null;
}

/** Si volver a `to` es retroceder (para avisarlo en la UI). */
export function isStepBack(from: SaleState, to: SaleState): boolean {
  return step(to) !== -1 && step(to) < step(from);
}

/**
 * Lo que hay que devolver a cada depósito: el neto de los movimientos del
 * pedido (descuentos negativos, devoluciones positivas). Así un pedido que
 * se preparó, volvió y se preparó de nuevo devuelve solo lo que falta.
 */
export function pendingReturns(
  movements: {
    productId: string;
    warehouseId: string;
    quantity: { toString(): string };
  }[],
): { productId: string; warehouseId: string; quantity: string }[] {
  const net = new Map<
    string,
    { productId: string; warehouseId: string; milli: bigint }
  >();
  for (const movement of movements) {
    const key = `${movement.productId}|${movement.warehouseId}`;
    const entry = net.get(key) ?? {
      productId: movement.productId,
      warehouseId: movement.warehouseId,
      milli: BigInt(0),
    };
    entry.milli += toMilli(movement.quantity);
    net.set(key, entry);
  }
  return [...net.values()]
    .filter((entry) => entry.milli < BigInt(0))
    .map((entry) => ({
      productId: entry.productId,
      warehouseId: entry.warehouseId,
      quantity: fromMilli(-entry.milli),
    }));
}
