import { isCuid } from "./ids";

// Puro: filtros de la pantalla de stock a partir de la URL.

export const STOCK_PAGE_SIZE = 50;
export const MOVEMENTS_PAGE_SIZE = 50;

/** "out": total 0 o menos (incluye productos sin movimientos); "negative": menor a 0. */
export type StockLevel = "all" | "out" | "negative";

export type StockFilters = {
  q?: string;
  category?: number;
  /** Con depósito, el nivel y la columna se miran solo en ese depósito. */
  warehouse?: string;
  level: StockLevel;
  page: number;
};

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw?.trim() || undefined;
}

/** Página de un listado: 1 si no viene o no es válida. */
export function parsePage(params: SearchParams): number {
  const page = Number.parseInt(first(params.page) ?? "", 10);
  return Number.isInteger(page) && page >= 1 ? page : 1;
}

/** Lo que no se entiende se ignora: una URL editada a mano no rompe la página. */
export function parseStockFilters(params: SearchParams): StockFilters {
  const q = first(params.q);
  const category = Number(first(params.category));
  const warehouse = first(params.warehouse);
  const level = first(params.level);
  return {
    q: q && q.length <= 100 ? q : undefined,
    category: Number.isInteger(category) && category > 0 ? category : undefined,
    warehouse: isCuid(warehouse) ? warehouse : undefined,
    level: level === "out" || level === "negative" ? level : "all",
    page: parsePage(params),
  };
}

/** Query string con los mismos filtros y otra página (para los links). */
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
