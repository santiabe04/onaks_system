import { describe, expect, it } from "vitest";
import {
  parseProductFilters,
  productQuery,
  productWhere,
} from "./product-filters";

describe("parseProductFilters", () => {
  it("lee búsqueda, categoría, estado y página", () => {
    expect(
      parseProductFilters({
        q: " piedras sanitarias ",
        category: "4",
        status: "paused",
        page: "2",
      }),
    ).toEqual({
      q: "piedras sanitarias",
      category: 4,
      status: "paused",
      page: 2,
    });
  });

  it("ignora valores inválidos", () => {
    expect(
      parseProductFilters({ category: "abc", status: "deleted", page: "0" }),
    ).toEqual({ q: undefined, category: undefined, status: "all", page: 1 });
  });
});

describe("productWhere", () => {
  it("sin filtros excluye solo los borrados", () => {
    expect(productWhere({ status: "all", page: 1 })).toEqual({
      deletedAt: null,
      isActive: undefined,
      categoryId: undefined,
      OR: undefined,
    });
  });

  it("busca en nombre, SKU y código de barras, e incluye las subcategorías", () => {
    const where = productWhere(
      { q: "correa", status: "active", page: 1 },
      [1, 2, 3],
    );
    expect(where.isActive).toBe(true);
    expect(where.categoryId).toEqual({ in: [1, 2, 3] });
    expect(where.OR).toEqual([
      { name: { contains: "correa", mode: "insensitive" } },
      { sku: { contains: "correa", mode: "insensitive" } },
      { barcode: { contains: "correa", mode: "insensitive" } },
    ]);
  });
});

describe("productQuery", () => {
  it("conserva los filtros y cambia la página", () => {
    expect(
      productQuery({ q: "collar", category: 5, status: "paused", page: 1 }, 3),
    ).toBe("?q=collar&category=5&status=paused&page=3");
    expect(productQuery({ status: "all", page: 2 }, 1)).toBe("");
  });
});
