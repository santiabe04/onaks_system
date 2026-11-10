import { describe, expect, it } from "vitest";
import {
  catalogQuery,
  catalogWhere,
  parseCatalogFilters,
  visibleCategoryTree,
} from "./catalog";
import type { CategoryRow } from "./category";

describe("parseCatalogFilters", () => {
  it("lee búsqueda, categoría y página", () => {
    expect(
      parseCatalogFilters({ q: " correa ", category: "5", page: "2" }),
    ).toEqual({ q: "correa", category: 5, page: 2 });
  });

  it("ignora valores inválidos", () => {
    expect(parseCatalogFilters({ category: "x", page: "-1" })).toEqual({
      q: undefined,
      category: undefined,
      page: 1,
    });
  });
});

describe("favoritos en el catálogo", () => {
  it("lee el filtro y lo conserva en los links", () => {
    expect(parseCatalogFilters({ favorites: "1" }).favorites).toBe(true);
    expect(parseCatalogFilters({ favorites: "0" }).favorites).toBeUndefined();
    expect(catalogQuery({ favorites: true, page: 2 })).toBe(
      "?favorites=1&page=2",
    );
    expect(
      catalogQuery({ favorites: true, page: 1 }, { favorites: undefined }),
    ).toBe("");
  });

  it("solo los favoritos de la empresa; sin empresa, ninguno", () => {
    expect(
      catalogWhere({ favorites: true, page: 1 }, undefined, "patitas"),
    ).toMatchObject({ favorites: { some: { customerId: "patitas" } } });
    expect(
      catalogWhere({ favorites: true, page: 1 }, undefined, null),
    ).toMatchObject({ id: { in: [] } });
    // Without the filter nothing changes.
    expect(catalogWhere({ page: 1 }, undefined, "patitas")).not.toHaveProperty(
      "favorites",
    );
  });
});

describe("catalogQuery", () => {
  it("conserva la búsqueda y cambia categoría o página", () => {
    const filters = { q: "alimento", category: 2, page: 3 };
    expect(catalogQuery(filters, { page: 4 })).toBe(
      "?q=alimento&category=2&page=4",
    );
    // Changing category goes back to the first page.
    expect(catalogQuery(filters, { category: 1, page: 1 })).toBe(
      "?q=alimento&category=1",
    );
    expect(catalogQuery({ page: 1 })).toBe("");
  });
});

describe("catalogWhere", () => {
  it("solo productos vigentes y activos, aunque no tengan stock", () => {
    expect(catalogWhere({ page: 1 })).toEqual({
      deletedAt: null,
      isActive: true,
      categoryId: undefined,
      OR: undefined,
    });
  });

  it("busca en nombre, SKU y código de barras dentro de las categorías", () => {
    const where = catalogWhere({ q: "piedras", page: 1 }, [4, 7]);
    expect(where.categoryId).toEqual({ in: [4, 7] });
    expect(where.OR).toHaveLength(3);
  });
});

describe("visibleCategoryTree", () => {
  // Food (1) › Dogs (2) › Puppies (3); Food › Cats (4); Accessories (5) › Leashes (6)
  const rows: CategoryRow[] = [
    { id: 1, name: "Alimentos", parentId: null },
    { id: 2, name: "Perros", parentId: 1 },
    { id: 3, name: "Cachorros", parentId: 2 },
    { id: 4, name: "Gatos", parentId: 1 },
    { id: 5, name: "Accesorios", parentId: null },
    { id: 6, name: "Correas", parentId: 5 },
  ];

  it("muestra las ramas con productos y oculta las vacías", () => {
    // Only Cachorros has visible products.
    expect(
      visibleCategoryTree(rows, new Set([3])).map((n) => n.path.join(" › ")),
    ).toEqual([
      "Alimentos",
      "Alimentos › Perros",
      "Alimentos › Perros › Cachorros",
    ]);
  });

  it("sin productos no hay menú", () => {
    expect(visibleCategoryTree(rows, new Set())).toEqual([]);
  });
});
