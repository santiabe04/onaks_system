import type { PaymentMethod } from "@/generated/prisma/enums";
import { fromMilli, toMilli } from "./quantity";

// Pure: groups the orders of a period by delivery zone (the city of
// the delivery address). Everything in integers: cents and thousandths.

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
    /** It can be missing: the product's volume is optional. */
    unitVolume: Numeric | null;
  }[];
};

export type Totals = {
  count: number;
  /** Money with 2 decimals ("1234.50"). */
  total: string;
  byPaymentMethod: Partial<Record<PaymentMethod, string>>;
  /** kg and liters, without extra zeros ("31.25"). */
  weight: string;
  volume: string;
  /** Some product has no volume entered: the volume total falls short. */
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

/** quantity × unit value, in rounded thousandths. */
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
 * Zones sorted by city name (and province, in case it repeats),
 * with their orders in the order received and the totals of each one and of the period.
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

/** How much of a product was ordered in these orders ("0" if in none). */
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
