import { describe, expect, it } from "vitest";
import { parsePage, parseStockFilters, stockQuery } from "./stock-filters";

const CENTRAL = "x6x0uzz02a26bhdgg5kk343s";

describe("parseStockFilters", () => {
  it("lee búsqueda, categoría, depósito, nivel y página", () => {
    expect(
      parseStockFilters({
        q: " alimento ",
        category: "2",
        warehouse: CENTRAL,
        level: "negative",
        page: "3",
      }),
    ).toEqual({
      q: "alimento",
      category: 2,
      warehouse: CENTRAL,
      level: "negative",
      page: 3,
    });
  });

  it("acepta el nivel bajo el stock mínimo", () => {
    expect(parseStockFilters({ level: "low" }).level).toBe("low");
  });

  it("ignora valores inválidos", () => {
    expect(
      parseStockFilters({ warehouse: "../x", level: "lowest", page: "-2" }),
    ).toEqual({
      q: undefined,
      category: undefined,
      warehouse: undefined,
      level: "all",
      page: 1,
    });
  });
});

describe("parsePage", () => {
  it("toma la primera página por defecto", () => {
    expect(parsePage({})).toBe(1);
    expect(parsePage({ page: ["4", "5"] })).toBe(4);
  });
});

describe("stockQuery", () => {
  it("conserva los filtros y cambia la página", () => {
    expect(stockQuery({ warehouse: CENTRAL, level: "out", page: 1 }, 2)).toBe(
      `?warehouse=${CENTRAL}&level=out&page=2`,
    );
    expect(stockQuery({ level: "all", page: 3 }, 1)).toBe("");
  });
});
