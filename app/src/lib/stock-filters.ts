import { isCuid } from "./ids";

// Pure: stock screen filters, from the URL.

export const STOCK_PAGE_SIZE = 50;
export const MOVEMENTS_PAGE_SIZE = 50;

/**
 * "out": total 0 or less (includes products with no movements); "negative": less
 * than 0; "low": below the product's minimum stock (those that have it set).
 */
export type StockLevel = "all" | "out" | "negative" | "low";

export type StockFilters = {
  q?: string;
  category?: number;
  /** With a warehouse, the level and the column are only looked at in that warehouse. */
  warehouse?: string;
  level: StockLevel;
  page: number;
};

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw?.trim() || undefined;
}

/** Page of a list: 1 if it is missing or not valid. */
export function parsePage(params: SearchParams): number {
  const page = Number.parseInt(first(params.page) ?? "", 10);
  return Number.isInteger(page) && page >= 1 ? page : 1;
}

/** What is not understood is ignored: a hand-edited URL does not break the page. */
export function parseStockFilters(params: SearchParams): StockFilters {
  const q = first(params.q);
  const category = Number(first(params.category));
  const warehouse = first(params.warehouse);
  const level = first(params.level);
  return {
    q: q && q.length <= 100 ? q : undefined,
    category: Number.isInteger(category) && category > 0 ? category : undefined,
    warehouse: isCuid(warehouse) ? warehouse : undefined,
    level:
      level === "out" || level === "negative" || level === "low"
        ? level
        : "all",
    page: parsePage(params),
  };
}

/** Query string with the same filters and another page (for the links). */
export function stockQuery(filters: StockFilters, page: number): string {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.category) params.set("category", String(filters.category));
  if (filters.warehouse) params.set("warehouse", filters.warehouse);
  if (filters.level !== "all") params.set("level", filters.level);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `?${query}` : "";
}
