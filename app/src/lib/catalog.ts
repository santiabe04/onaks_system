import type { Prisma } from "@/generated/prisma/client";
import {
  flattenCategoryTree,
  type CategoryNode,
  type CategoryRow,
} from "./category";

// Pure: catalog filters and rules that customers see.

export const CATALOG_PAGE_SIZE = 24;

export type CatalogFilters = {
  /** Searches by name, SKU and barcode. */
  q?: string;
  category?: number;
  /** Only the customer's company's favorites. */
  favorites?: boolean;
  page: number;
};

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw?.trim() || undefined;
}

/** What is not understood is ignored: a hand-edited URL does not break the page. */
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

/** Query string with the same filters and other changes (page, category). */
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
 * What a customer sees: current and active products. Stock does not count: the
 * admin pauses a product if they do not want to sell it (for lack of stock or any other reason).
 */
export const VISIBLE_PRODUCT: Prisma.ProductWhereInput = {
  deletedAt: null,
  isActive: true,
};

/**
 * `customerId` is the customer's company: with the favorites filter, only
 * its favorites; without a company (an admin looking at the shop) there are none.
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
 * The menu's category tree, only with the ones that have visible products
 * (directly or in some subcategory): no empty branches for the customer.
 */
export function visibleCategoryTree(
  rows: CategoryRow[],
  withProducts: ReadonlySet<number>,
): CategoryNode[] {
  const nodes = flattenCategoryTree(rows);
  const keep = new Set<number>();
  // Bottom-up traversal: a category is shown if it has products or
  // if any of its children is shown.
  for (const node of [...nodes].reverse()) {
    const hasVisibleChild = rows.some(
      (row) => row.parentId === node.id && keep.has(row.id),
    );
    if (withProducts.has(node.id) || hasVisibleChild) keep.add(node.id);
  }
  return nodes.filter((node) => keep.has(node.id));
}
