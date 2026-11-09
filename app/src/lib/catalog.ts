import type { Prisma } from "@/generated/prisma/client";
import {
  flattenCategoryTree,
  type CategoryNode,
  type CategoryRow,
} from "./category";

// Puro: filtros y reglas del catálogo que ven los clientes.

export const CATALOG_PAGE_SIZE = 24;

export type CatalogFilters = {
  /** Busca en nombre, SKU y código de barras. */
  q?: string;
  category?: number;
  /** Solo los favoritos de la empresa del cliente. */
  favorites?: boolean;
  page: number;
};

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw?.trim() || undefined;
}

/** Lo que no se entiende se ignora: una URL editada a mano no rompe la página. */
export function parseCatalogFilters(params: SearchParams): CatalogFilters {
  const q = first(params.q);
  const category = Number(first(params.category));
  const page = Number.parseInt(first(params.page) ?? "", 10);
  return {
    q: q && q.length <= 100 ? q : undefined,
    category: Number.isInteger(category) && category > 0 ? category : undefined,
    favorites: first(params.favorites) === "1" || undefined,
    page: Number.isInteger(page) && page >= 1 ? page : 1,
  };
}

/** Query string con los mismos filtros y otros cambios (página, categoría). */
export function catalogQuery(
  filters: CatalogFilters,
  changes: Partial<CatalogFilters> = {},
): string {
  const next = { ...filters, ...changes };
  const params = new URLSearchParams();
  if (next.q) params.set("q", next.q);
  if (next.category) params.set("category", String(next.category));
  if (next.favorites) params.set("favorites", "1");
  if (next.page > 1) params.set("page", String(next.page));
  const query = params.toString();
  return query ? `?${query}` : "";
}

/**
 * Qué ve un cliente: productos vigentes y activos. El stock no cuenta: el
 * admin pausa un producto si no quiere venderlo (por falta de stock u otra razón).
 */
export const VISIBLE_PRODUCT: Prisma.ProductWhereInput = {
  deletedAt: null,
  isActive: true,
};

/**
 * `customerId` es la empresa del cliente: con el filtro de favoritos, solo
 * sus favoritos; sin empresa (un admin mirando la tienda) no hay ninguno.
 */
export function catalogWhere(
  filters: CatalogFilters,
  categoryIds?: number[],
  customerId?: string | null,
): Prisma.ProductWhereInput {
  const contains = (field: "name" | "sku" | "barcode") => ({
    [field]: { contains: filters.q, mode: "insensitive" as const },
  });
  return {
    ...VISIBLE_PRODUCT,
    categoryId: categoryIds ? { in: categoryIds } : undefined,
    ...(filters.favorites
      ? customerId
        ? { favorites: { some: { customerId } } }
        : { id: { in: [] } }
      : {}),
    OR: filters.q
      ? [contains("name"), contains("sku"), contains("barcode")]
      : undefined,
  };
}

/**
 * El árbol de categorías del menú, solo con las que tienen productos visibles
 * (directamente o en alguna subcategoría): sin ramas vacías para el cliente.
 */
export function visibleCategoryTree(
  rows: CategoryRow[],
  withProducts: ReadonlySet<number>,
): CategoryNode[] {
  const nodes = flattenCategoryTree(rows);
  const keep = new Set<number>();
  // Recorrido de abajo hacia arriba: una categoría se ve si tiene productos o
  // si se ve alguna de sus hijas.
  for (const node of [...nodes].reverse()) {
    const hasVisibleChild = rows.some(
      (row) => row.parentId === node.id && keep.has(row.id),
    );
    if (withProducts.has(node.id) || hasVisibleChild) keep.add(node.id);
  }
  return nodes.filter((node) => keep.has(node.id));
}
