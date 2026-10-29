import { interpolate } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/es";
import { isCuid } from "./ids";
import { parseDecimalInput } from "./decimal-input";
import {
  PICKING_SHORTAGE_REASONS,
  type Shortage,
  type ShortageReason,
} from "./partial-delivery";
import { fromMilli, QUANTITY_LIMITS, toMilli } from "./quantity";
import { BULK_MAX_SALES } from "./sale-state-form";

// Puro: listas de picking (qué sacar del depósito para preparar pedidos).

export const PICKING_NOTES_MAX_LENGTH = 300;
export const PREPARER_MAX_LENGTH = 80;
export const LOCATION_MAX_LENGTH = 30;
const ZERO = BigInt(0);

type Numeric = { toString(): string } | string;
type Messages = Dictionary["picking"]["errors"];
type PickingReason = (typeof PICKING_SHORTAGE_REASONS)[number];

/**
 * Ubicación en el depósito: sin espacios de más y en mayúsculas ("a-3-2" →
 * "A-3-2"). Vacía = sin ubicación; null si es demasiado larga.
 */
export function normalizeLocation(raw: string): string | null | "" {
  const value = raw.trim().replace(/\s+/g, " ").toUpperCase();
  if (value.length > LOCATION_MAX_LENGTH) return null;
  return value;
}

/** Orden natural de ubicaciones ("A-2" antes que "A-10"); sin ubicación, al final. */
export function compareLocations(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a.localeCompare(b, "es", { numeric: true, sensitivity: "base" });
}

/** Lista nueva: depósito, pedidos elegidos (`sale`, repetidos) y comentario. */
export function parsePickingRequest(
  formData: FormData,
  t: Messages,
):
  | {
      ok: true;
      data: { warehouseId: string; saleIds: string[]; notes: string | null };
    }
  | { ok: false; error: string } {
  const warehouseId = formData.get("warehouseId");
  if (!isCuid(warehouseId)) return { ok: false, error: t.warehouse };
  // Desde las tablas de pedidos llega "id:ESTADO" (el de la barra masiva).
  const saleIds = [
    ...new Set(
      formData
        .getAll("sale")
        .map((raw) => (typeof raw === "string" ? raw.split(":")[0] : ""))
        .filter((id) => isCuid(id)),
    ),
  ];
  if (saleIds.length === 0) return { ok: false, error: t.noSales };
  if (saleIds.length > BULK_MAX_SALES) {
    return {
      ok: false,
      error: interpolate(t.tooMany, { max: BULK_MAX_SALES }),
    };
  }
  const value = formData.get("notes");
  const notes = typeof value === "string" ? value.trim() : "";
  if (notes.length > PICKING_NOTES_MAX_LENGTH) {
    return {
      ok: false,
      error: interpolate(t.tooLong, { max: PICKING_NOTES_MAX_LENGTH }),
    };
  }
  return { ok: true, data: { warehouseId, saleIds, notes: notes || null } };
}

export type PickingLine = {
  saleId: string;
  saleNumber: number;
  productId: string;
  name: string;
  sku: string;
  unit: string;
  location: string | null;
  quantity: Numeric;
};

export type PickingStop = {
  productId: string;
  name: string;
  sku: string;
  unit: string;
  location: string | null;
  /** Total a sacar ("12", "2.5"). */
  total: string;
  /** De qué pedidos sale, por número. */
  orders: { saleNumber: number; quantity: string }[];
};

/**
 * El recorrido: un renglón por producto con el total y de qué pedidos sale,
 * ordenado por ubicación (los sin ubicación al final) y después por nombre.
 */
export function pickingRoute(lines: PickingLine[]): PickingStop[] {
  const stops = new Map<string, PickingStop & { milli: bigint }>();
  for (const line of lines) {
    const stop = stops.get(line.productId) ?? {
      productId: line.productId,
      name: line.name,
      sku: line.sku,
      unit: line.unit,
      location: line.location,
      total: "0",
      milli: ZERO,
      orders: [],
    };
    stop.milli += toMilli(line.quantity);
    stop.orders.push({
      saleNumber: line.saleNumber,
      quantity: fromMilli(toMilli(line.quantity)),
    });
    stops.set(line.productId, stop);
  }
  return [...stops.values()]
    .map(({ milli, ...stop }) => ({
      ...stop,
      total: fromMilli(milli),
      orders: stop.orders.sort((a, b) => a.saleNumber - b.saleNumber),
    }))
    .sort(
      (a, b) =>
        compareLocations(a.location, b.location) ||
        a.name.localeCompare(b.name, "es"),
    );
}

export type PickedLine = {
  saleId: string;
  productId: string;
  picked: string;
  reason: PickingReason | null;
};

/**
 * Lo preparado al confirmar (`picked_<pedido>_<producto>`, y si faltó,
 * `reason_<pedido>_<producto>`): no más de lo pedido, con motivo si faltó.
 * Devuelve las líneas y los faltantes por pedido (para `applyShortages`).
 * Un pedido no puede quedar sin nada: se saca de la lista.
 */
export function parsePicked(
  formData: FormData,
  items: {
    saleId: string;
    saleNumber: number;
    productId: string;
    quantity: Numeric;
    allowsDecimals: boolean;
  }[],
  t: Messages,
):
  | { ok: true; lines: PickedLine[]; shortages: Map<string, Shortage[]> }
  | { ok: false; error: string } {
  const lines: PickedLine[] = [];
  const shortages = new Map<string, Shortage[]>();
  const pickedBySale = new Map<string, bigint>();
  for (const item of items) {
    const key = `${item.saleId}_${item.productId}`;
    const raw = formData.get(`picked_${key}`);
    const parsed = parseDecimalInput(typeof raw === "string" ? raw : "", {
      ...QUANTITY_LIMITS,
      maxDecimals: item.allowsDecimals ? QUANTITY_LIMITS.maxDecimals : 0,
    });
    if (parsed === null) return { ok: false, error: t.picked };
    const ordered = toMilli(item.quantity);
    const picked = toMilli(parsed);
    if (picked > ordered) return { ok: false, error: t.pickedTooMuch };
    pickedBySale.set(
      item.saleId,
      (pickedBySale.get(item.saleId) ?? ZERO) + picked,
    );
    let reason: PickingReason | null = null;
    if (picked < ordered) {
      const value = formData.get(`reason_${key}`);
      if (!PICKING_SHORTAGE_REASONS.includes(value as PickingReason)) {
        return { ok: false, error: t.reason };
      }
      reason = value as PickingReason;
      shortages.set(item.saleId, [
        ...(shortages.get(item.saleId) ?? []),
        {
          productId: item.productId,
          ordered: fromMilli(ordered),
          delivered: fromMilli(picked),
          missing: fromMilli(ordered - picked),
          reason: reason as ShortageReason,
        },
      ]);
    }
    lines.push({
      saleId: item.saleId,
      productId: item.productId,
      picked: fromMilli(picked),
      reason,
    });
  }
  const empty = items.find((item) => pickedBySale.get(item.saleId) === ZERO);
  if (empty) {
    return {
      ok: false,
      error: interpolate(t.emptyOrder, { number: empty.saleNumber }),
    };
  }
  return { ok: true, lines, shortages };
}

/** Comentario de los movimientos de stock de un faltante del picking. */
export function pickingComment(listNumber: number, saleNumber: number): string {
  return `Picking #${listNumber} · pedido #${saleNumber}`;
}

/** Preparador (opcional) al confirmar. */
export function parsePreparer(
  formData: FormData,
  t: Messages,
): { ok: true; preparer: string | null } | { ok: false; error: string } {
  const value = formData.get("preparer");
  const preparer = typeof value === "string" ? value.trim() : "";
  if (preparer.length > PREPARER_MAX_LENGTH) {
    return {
      ok: false,
      error: interpolate(t.tooLong, { max: PREPARER_MAX_LENGTH }),
    };
  }
  return { ok: true, preparer: preparer || null };
}
