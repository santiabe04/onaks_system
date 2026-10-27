import type { Prisma } from "@/generated/prisma/client";

// Puro: filtros de la lista de productos del admin a partir de la URL.

export const PRODUCT_PAGE_SIZE = 50;

export type ProductStatus = "all" | "active" | "paused";

export type ProductFilters = {
  /** Busca en nombre, SKU y código de barras. */
  q?: string;
  category?: number;
  status: ProductStatus;
  page: number;
};

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw?.trim() || undefined;
}

/** Lo que no se entiende se ignora: una URL editada a mano no rompe la página. */
export function parseProductFilters(params: SearchParams): ProductFilters {
  const q = first(params.q);
  const category = Number(first(params.category));
  const status = first(params.status);
  const page = Number.parseInt(first(params.page) ?? "", 10);
  return {
    q: q && q.length <= 100 ? q : undefined,
    category: Number.isInteger(category) && category > 0 ? category : undefined,
    status: status === "active" || status === "paused" ? status : "all",
    page: Number.isInteger(page) && page >= 1 ? page : 1,
  };
}

/**
 * `categoryIds`: la categoría elegida y sus descendientes (filtrar por
 * "Alimentos" incluye "Perros › Cachorros"). Los borrados nunca aparecen.
 */
export function productWhere(
  filters: ProductFilters,
  categoryIds?: number[],
): Prisma.ProductWhereInput {
  const contains = (field: "name" | "sku" | "barcode") => ({
    [field]: { contains: filters.q, mode: "insensitive" as const },
  });
  return {
    deletedAt: null,
    isActive:
      filters.status === "all" ? undefined : filters.status === "active",
    categoryId: categoryIds ? { in: categoryIds } : undefined,
    OR: filters.q
      ? [contains("name"), contains("sku"), contains("barcode")]
      : undefined,
  };
}

/** Query string con los mismos filtros y otra página (para los links). */
export function productQuery(filters: ProductFilters, page: number): string {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.category) params.set("category", String(filters.category));
  if (filters.status !== "all") params.set("status", filters.status);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `?${query}` : "";
}
