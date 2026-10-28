import type { SaleState } from "@/generated/prisma/enums";
import { interpolate } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/es";
import { fromCents, toCents } from "./account";
import { isCuid } from "./ids";
import { toMilli } from "./quantity";

// Puro: reglas de las hojas de ruta.

/** Solo se reparten los pedidos listos para despachar. */
export const ROUTE_SALE_STATE: SaleState = "READY_TO_SHIP";

export const ROUTE_NOTES_MAX_LENGTH = 300;

type Numeric = { toString(): string } | string;

/**
 * El orden de las paradas después de mover una hacia arriba (-1) o abajo
 * (+1). Si ya está en la punta, queda igual.
 */
export function moveStop(
  order: string[],
  stopId: string,
  direction: -1 | 1,
): string[] {
  const index = order.indexOf(stopId);
  const target = index + direction;
  if (index === -1 || target < 0 || target >= order.length) return order;
  const next = [...order];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export type CapacityCheck = {
  overWeight: boolean;
  overVolume: boolean;
};

/** Si la carga se pasa de la capacidad del vehículo (la que esté cargada). */
export function checkCapacity(
  load: { weight: Numeric; volume: Numeric },
  vehicle: {
    capacityKg: Numeric | null;
    capacityLiters: Numeric | null;
  } | null,
): CapacityCheck {
  return {
    overWeight:
      !!vehicle?.capacityKg &&
      toMilli(load.weight) > toMilli(vehicle.capacityKg),
    overVolume:
      !!vehicle?.capacityLiters &&
      toMilli(load.volume) > toMilli(vehicle.capacityLiters),
  };
}

export type StopToCollect = {
  stopId: string;
  customerId: string;
  /** Lo que falta cobrar de este pedido (ya descontado el saldo a favor). */
  salePending: Numeric;
  /** Saldo del cliente: positivo debe (pedidos entregados), negativo a favor. */
  customerBalance: Numeric;
};

/**
 * Cuánto cobrar en cada parada: lo que falta del pedido más la deuda anterior
 * del cliente, que se suma una sola vez (en su primera parada de la hoja).
 */
export function amountsToCollect(
  stops: StopToCollect[],
): Record<string, { order: string; previousDebt: string; total: string }> {
  const seen = new Set<string>();
  const result: Record<
    string,
    { order: string; previousDebt: string; total: string }
  > = {};
  for (const stop of stops) {
    const order = toCents(stop.salePending);
    const balance = toCents(stop.customerBalance);
    const debt =
      !seen.has(stop.customerId) && balance > BigInt(0) ? balance : BigInt(0);
    seen.add(stop.customerId);
    result[stop.stopId] = {
      order: fromCents(order),
      previousDebt: fromCents(debt),
      total: fromCents(order + debt),
    };
  }
  return result;
}

// --- Formulario de la hoja (fecha, repartidor, vehículo, comentario) ---

type Messages = Dictionary["routes"]["errors"];

export type RouteSheetValues = {
  date: string;
  driverId: string;
  vehicleId: string;
  notes: string;
};

export type RouteSheetInput = {
  /** YYYY-MM-DD. */
  date: string;
  driverId: string;
  vehicleId: string | null;
  notes: string | null;
};

export type RouteSheetFormState = {
  errors?: Partial<Record<keyof RouteSheetValues | "form", string[]>>;
  values?: RouteSheetValues;
};

export function validateRouteSheetForm(
  formData: FormData,
  t: Messages,
):
  | { ok: true; data: RouteSheetInput; values: RouteSheetValues }
  | { ok: false; state: RouteSheetFormState } {
  const read = (key: string) => {
    const value = formData.get(key);
    return typeof value === "string" ? value.trim() : "";
  };
  const values: RouteSheetValues = {
    date: read("date"),
    driverId: read("driverId"),
    vehicleId: read("vehicleId"),
    notes: read("notes"),
  };
  const errors: NonNullable<RouteSheetFormState["errors"]> = {};
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(values.date) ||
    Number.isNaN(Date.parse(values.date))
  ) {
    errors.date = [t.date];
  }
  if (!isCuid(values.driverId)) errors.driverId = [t.driver];
  if (values.vehicleId && !isCuid(values.vehicleId)) {
    errors.vehicleId = [t.vehicle];
  }
  if (values.notes.length > ROUTE_NOTES_MAX_LENGTH) {
    errors.notes = [interpolate(t.tooLong, { max: ROUTE_NOTES_MAX_LENGTH })];
  }
  if (Object.keys(errors).length > 0) {
    return { ok: false, state: { errors, values } };
  }
  return {
    ok: true,
    values,
    data: {
      date: values.date,
      driverId: values.driverId,
      vehicleId: values.vehicleId || null,
      notes: values.notes || null,
    },
  };
}
