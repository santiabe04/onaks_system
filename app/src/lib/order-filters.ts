import type { Prisma } from "@/generated/prisma/client";
import {
  PaymentMethod,
  SalePaymentState,
  SaleState,
} from "@/generated/prisma/enums";
import { isCuid } from "./ids";
import { dayStart } from "./order-period";

// Puro: filtros de la lista de pedidos del admin, a partir de la URL.

export const ORDERS_PAGE_SIZE = 50;

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_INT = 2_147_483_647;

export type OrderFilters = {
  number?: number;
  /** Vacío = todos (incluidos los cancelados). */
  states: SaleState[];
  paymentStates: SalePaymentState[];
  paymentMethod?: PaymentMethod;
  customer?: string;
  city?: number;
  product?: string;
  /** YYYY-MM-DD de Argentina, inclusive. */
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

/** Los valores repetidos o desconocidos se descartan. */
function enumValues<T extends string>(
  values: Record<string, T>,
  raw: string[],
): T[] {
  const allowed = Object.values(values) as string[];
  return [...new Set(raw)].filter((value): value is T =>
    allowed.includes(value),
  );
}

/** Lo que no se entiende se ignora: una URL editada a mano no rompe la página. */
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
    createdAt:
      from || to
        ? {
            gte: from,
            // `to` es inclusive: hasta el comienzo del día siguiente.
            lt: to ? new Date(to.getTime() + DAY_MS) : undefined,
          }
        : undefined,
  };
}

/** Si hay algún filtro aplicado (para mostrar "Limpiar"). */
export function hasOrderFilters(filters: OrderFilters): boolean {
  return orderQuery({ ...filters, page: 1 }) !== "";
}

/** Query string con los filtros y la página (sin los valores por defecto). */
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
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `?${query}` : "";
}
