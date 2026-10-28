import type { PaymentMethod } from "@/generated/prisma/enums";
import { fromMilli, toMilli } from "./quantity";

// Puro: agrupa los pedidos de un período por zona de reparto (la localidad de
// la dirección de entrega). Todo en enteros: centavos y milésimas.

type Numeric = { toString(): string } | string;

export type ZoneOrderInput = {
  cityId: number;
  cityName: string;
  stateName: string;
  paymentMethod: PaymentMethod;
  total: Numeric;
  items: {
    quantity: Numeric;
    unitWeight: Numeric;
    /** Puede faltar: el volumen del producto es opcional. */
    unitVolume: Numeric | null;
  }[];
};

export type Totals = {
  count: number;
  /** Plata con 2 decimales ("1234.50"). */
  total: string;
  byPaymentMethod: Partial<Record<PaymentMethod, string>>;
  /** kg y litros, sin ceros de más ("31.25"). */
  weight: string;
  volume: string;
  /** Algún producto no tiene volumen cargado: el total de volumen se queda corto. */
  missingVolume: boolean;
};

export type Zone<T> = {
  cityId: number;
  cityName: string;
  stateName: string;
  orders: (T & { weight: string; volume: string })[];
  totals: Totals;
};

const ZERO = BigInt(0);
const HUNDRED = BigInt(100);
const MILLI = BigInt(1000);
const HALF_MILLI = BigInt(500);

function cents(value: Numeric): bigint {
  const [integer, decimals = ""] = value.toString().split(".");
  return BigInt(integer + decimals.padEnd(2, "0").slice(0, 2));
}

function money(value: bigint): string {
  return `${value / HUNDRED}.${String(value % HUNDRED).padStart(2, "0")}`;
}

/** cantidad × valor unitario, en milésimas redondeadas. */
function product(quantity: Numeric, unit: Numeric): bigint {
  return (toMilli(quantity) * toMilli(unit) + HALF_MILLI) / MILLI;
}

type Accumulator = {
  count: number;
  total: bigint;
  byPaymentMethod: Partial<Record<PaymentMethod, bigint>>;
  weight: bigint;
  volume: bigint;
  missingVolume: boolean;
};

function emptyAccumulator(): Accumulator {
  return {
    count: 0,
    total: ZERO,
    byPaymentMethod: {},
    weight: ZERO,
    volume: ZERO,
    missingVolume: false,
  };
}

function add(
  acc: Accumulator,
  order: ZoneOrderInput,
  weight: bigint,
  volume: bigint,
  missingVolume: boolean,
) {
  const amount = cents(order.total);
  acc.count += 1;
  acc.total += amount;
  acc.byPaymentMethod[order.paymentMethod] =
    (acc.byPaymentMethod[order.paymentMethod] ?? ZERO) + amount;
  acc.weight += weight;
  acc.volume += volume;
  acc.missingVolume ||= missingVolume;
}

function toTotals(acc: Accumulator): Totals {
  const byPaymentMethod: Totals["byPaymentMethod"] = {};
  for (const [method, amount] of Object.entries(acc.byPaymentMethod)) {
    byPaymentMethod[method as PaymentMethod] = money(amount);
  }
  return {
    count: acc.count,
    total: money(acc.total),
    byPaymentMethod,
    weight: fromMilli(acc.weight),
    volume: fromMilli(acc.volume),
    missingVolume: acc.missingVolume,
  };
}

/**
 * Zonas ordenadas por nombre de localidad (y provincia, por si se repite),
 * con sus pedidos en el orden recibido y los totales de cada una y del período.
 */
export function groupOrdersByZone<T extends ZoneOrderInput>(
  orders: T[],
  locale = "es",
): { zones: Zone<T>[]; totals: Totals } {
  const zones = new Map<number, { zone: Zone<T>; acc: Accumulator }>();
  const all = emptyAccumulator();

  for (const order of orders) {
    let weight = ZERO;
    let volume = ZERO;
    let missingVolume = false;
    for (const item of order.items) {
      weight += product(item.quantity, item.unitWeight);
      if (item.unitVolume === null) missingVolume = true;
      else volume += product(item.quantity, item.unitVolume);
    }

    let entry = zones.get(order.cityId);
    if (!entry) {
      entry = {
        zone: {
          cityId: order.cityId,
          cityName: order.cityName,
          stateName: order.stateName,
          orders: [],
          totals: toTotals(emptyAccumulator()),
        },
        acc: emptyAccumulator(),
      };
      zones.set(order.cityId, entry);
    }
    entry.zone.orders.push({
      ...order,
      weight: fromMilli(weight),
      volume: fromMilli(volume),
    });
    add(entry.acc, order, weight, volume, missingVolume);
    add(all, order, weight, volume, missingVolume);
  }

  const result = [...zones.values()].map(({ zone, acc }) => ({
    ...zone,
    totals: toTotals(acc),
  }));
  result.sort(
    (a, b) =>
      a.cityName.localeCompare(b.cityName, locale) ||
      a.stateName.localeCompare(b.stateName, locale),
  );
  return { zones: result, totals: toTotals(all) };
}

/** Cuánto se pidió de un producto en estos pedidos ("0" si en ninguno). */
export function productQuantity(
  orders: {
    items: { productId: string; quantity: { toString(): string } }[];
  }[],
  productId: string,
): string {
  let total = BigInt(0);
  for (const order of orders) {
    for (const item of order.items) {
      if (item.productId === productId) total += toMilli(item.quantity);
    }
  }
  return fromMilli(total);
}
