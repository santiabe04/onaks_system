import type { SaleState } from "@/generated/prisma/enums";
import { interpolate } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/es";
import { fromCents, toCents } from "./account";
import { isCuid } from "./ids";
import { toMilli } from "./quantity";

// Pure: route sheet rules.

/** Only orders ready to ship are delivered. */
export const ROUTE_SALE_STATE: SaleState = "READY_TO_SHIP";

export const ROUTE_NOTES_MAX_LENGTH = 300;

type Numeric = { toString(): string } | string;

/**
 * The order of the stops after moving one up (-1) or down
 * (+1). If it is already at the end, it stays the same.
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

/** If the load exceeds the vehicle's capacity (the one that is entered). */
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
  /** What is still to collect on this order (already deducting the credit balance). */
  salePending: Numeric;
  /** Customer balance: positive owes (delivered orders), negative credit. */
  customerBalance: Numeric;
};

/**
 * How much to collect at each stop: what is missing on the order plus the customer's
 * previous debt, which is added only once (at their first stop on the sheet).
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

// --- Sheet form (date, driver, vehicle, comment) ---

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
