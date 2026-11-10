import type { Prisma } from "@/generated/prisma/client";
import {
  PaymentMethod,
  SalePaymentState,
  SaleState,
} from "@/generated/prisma/enums";
import { isCuid } from "./ids";
import { dayStart } from "./order-period";

// Pure: the admin's order list filters, from the URL.

export const ORDERS_PAGE_SIZE = 50;

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_INT = 2_147_483_647;

export type OrderFilters = {
  number?: number;
  /** Empty = all (including canceled ones). */
  states: SaleState[];
  paymentStates: SalePaymentState[];
  paymentMethod?: PaymentMethod;
  customer?: string;
  city?: number;
  product?: string;
  /** Only held for credit (not approved or canceled). */
  held?: boolean;
  /** Only with a transfer receipt waiting for review. */
  proof?: boolean;
  /** YYYY-MM-DD in Argentina, inclusive. */
  from?: string;
  to?: string;
  page: number;
};

type SearchParams = Record<string, string | string[] | undefined>;

function all(value: string | string[] | undefined): string[] {
  return (Array.isArray(value) ? value : value ? [value] : [])
    .map((item) => item.trim())
    .filter(Boolean);
}

function first(value: string | string[] | undefined): string | undefined {
  return all(value)[0];
}

function positiveInt(raw: string | undefined): number | undefined {
  if (!raw || !/^\d+$/.test(raw)) return undefined;
  const value = Number(raw);
  return value >= 1 && value <= MAX_INT ? value : undefined;
}

/** Repeated or unknown values are discarded. */
function enumValues<T extends string>(
  values: Record<string, T>,
  raw: string[],
): T[] {
  const allowed = Object.values(values) as string[];
  return [...new Set(raw)].filter((value): value is T =>
    allowed.includes(value),
  );
}

/** What is not understood is ignored: a hand-edited URL does not break the page. */
export function parseOrderFilters(params: SearchParams): OrderFilters {
  const customer = first(params.customer);
  const product = first(params.product);
  const method = first(params.paymentMethod);
  const from = first(params.from);
  const to = first(params.to);
  return {
    number: positiveInt(first(params.number)),
    states: enumValues(SaleState, all(params.state)),
    paymentStates: enumValues(SalePaymentState, all(params.paymentState)),
    paymentMethod: enumValues(PaymentMethod, method ? [method] : [])[0],
    customer: isCuid(customer) ? customer : undefined,
    city: positiveInt(first(params.city)),
    product: isCuid(product) ? product : undefined,
    held: first(params.held) === "1" || undefined,
    proof: first(params.proof) === "1" || undefined,
    from: dayStart(from) ? from : undefined,
    to: dayStart(to) ? to : undefined,
    page: positiveInt(first(params.page)) ?? 1,
  };
}

export function orderWhere(filters: OrderFilters): Prisma.SaleWhereInput {
  const from = dayStart(filters.from);
  const to = dayStart(filters.to);
  return {
    number: filters.number,
    state: filters.states.length ? { in: filters.states } : undefined,
    paymentState: filters.paymentStates.length
      ? { in: filters.paymentStates }
      : undefined,
    paymentMethod: filters.paymentMethod,
    address:
      filters.customer || filters.city
        ? { customerId: filters.customer, cityId: filters.city }
        : undefined,
    items: filters.product
      ? { some: { productId: filters.product } }
      : undefined,
    ...(filters.held
      ? {
          creditHoldAt: { not: null },
          creditReleasedAt: null,
          // A held order that was canceled no longer waits for anything.
          NOT: { state: "CANCELED" },
        }
      : {}),
    ...(filters.proof
      ? {
          transferProofs: { some: { state: "PENDING" as const } },
          NOT: { state: "CANCELED" as const },
        }
      : {}),
    createdAt:
      from || to
        ? {
            gte: from,
            // `to` is inclusive: up to the start of the next day.
            lt: to ? new Date(to.getTime() + DAY_MS) : undefined,
          }
        : undefined,
  };
}

/** If any filter is applied (to show "Clear"). */
export function hasOrderFilters(filters: OrderFilters): boolean {
  return orderQuery({ ...filters, page: 1 }) !== "";
}

/** Query string with the filters and the page (without the default values). */
export function orderQuery(filters: OrderFilters, page = filters.page): string {
  const params = new URLSearchParams();
  if (filters.number) params.set("number", String(filters.number));
  for (const state of filters.states) params.append("state", state);
  for (const state of filters.paymentStates) {
    params.append("paymentState", state);
  }
  if (filters.paymentMethod) params.set("paymentMethod", filters.paymentMethod);
  if (filters.customer) params.set("customer", filters.customer);
  if (filters.city) params.set("city", String(filters.city));
  if (filters.product) params.set("product", filters.product);
  if (filters.held) params.set("held", "1");
  if (filters.proof) params.set("proof", "1");
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `?${query}` : "";
}

/**
 * What also applies to the by-zone view, the CSV and the dashboard: the
 * period is set by them, so number, dates and page are not included.
 */
export type ZoneFilters = Pick<
  OrderFilters,
  "states" | "paymentStates" | "paymentMethod" | "customer" | "city" | "product"
>;

export const NO_ZONE_FILTERS: ZoneFilters = { states: [], paymentStates: [] };

function onlyZoneFilters(filters: ZoneFilters): OrderFilters {
  return {
    states: filters.states,
    paymentStates: filters.paymentStates,
    paymentMethod: filters.paymentMethod,
    customer: filters.customer,
    city: filters.city,
    product: filters.product,
    page: 1,
  };
}

/** Without chosen statuses, canceled orders are left out: they are not delivered. */
export function zoneOrderWhere(filters: ZoneFilters): Prisma.SaleWhereInput {
  return {
    ...orderWhere(onlyZoneFilters(filters)),
    state: filters.states.length ? { in: filters.states } : { not: "CANCELED" },
  };
}

/** The filters as pairs to add to another URL (the period's). */
export function zoneFilterParams(filters: ZoneFilters): [string, string][] {
  return [
    ...new URLSearchParams(orderQuery(onlyZoneFilters(filters))).entries(),
  ];
}
