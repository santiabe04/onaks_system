import { describe, expect, it } from "vitest";
import {
  hasOrderFilters,
  NO_ZONE_FILTERS,
  orderQuery,
  orderWhere,
  parseOrderFilters,
  zoneFilterParams,
  zoneOrderWhere,
} from "./order-filters";

describe("parseOrderFilters", () => {
  it("sin parámetros no filtra nada", () => {
    const filters = parseOrderFilters({});
    expect(filters).toEqual({ states: [], paymentStates: [], page: 1 });
    expect(hasOrderFilters(filters)).toBe(false);
  });

  it("lee varios estados y descarta repetidos y desconocidos", () => {
    expect(
      parseOrderFilters({
        state: ["PENDING", "PREPARING", "PENDING", "LOST"],
        paymentState: "PAID",
      }),
    ).toMatchObject({
      states: ["PENDING", "PREPARING"],
      paymentStates: ["PAID"],
    });
  });

  it("ignora ids, números y fechas inválidos", () => {
    expect(
      parseOrderFilters({
        number: "0",
        customer: "../x",
        city: "abc",
        product: "PROD-1",
        from: "2026-02-31",
        paymentMethod: "BITCOIN",
        page: "-2",
      }),
    ).toEqual({ states: [], paymentStates: [], page: 1 });
  });

  it("acepta un pedido de un pet shop con todos los filtros", () => {
    expect(
      parseOrderFilters({
        number: "12",
        customer: "custpetshop",
        city: "3",
        product: "prodbolsa15",
        paymentMethod: "CASH",
        from: "2026-10-24",
        to: "2026-10-30",
        page: "2",
      }),
    ).toMatchObject({
      number: 12,
      customer: "custpetshop",
      city: 3,
      product: "prodbolsa15",
      paymentMethod: "CASH",
      from: "2026-10-24",
      to: "2026-10-30",
      page: 2,
    });
  });
});

describe("orderWhere", () => {
  it("arma el filtro de Prisma, con `to` inclusive en hora de Argentina", () => {
    const where = orderWhere(
      parseOrderFilters({
        state: ["PENDING", "PREPARING"],
        city: "3",
        product: "prodbolsa15",
        from: "2026-10-24",
        to: "2026-10-30",
      }),
    );
    expect(where).toMatchObject({
      state: { in: ["PENDING", "PREPARING"] },
      address: { cityId: 3 },
      items: { some: { productId: "prodbolsa15" } },
    });
    expect(where.createdAt).toEqual({
      gte: new Date("2026-10-24T03:00:00Z"),
      lt: new Date("2026-10-31T03:00:00Z"),
    });
  });

  it("sin filtros no restringe nada", () => {
    const where = orderWhere(parseOrderFilters({}));
    expect(Object.values(where).every((value) => value === undefined)).toBe(
      true,
    );
  });
});

describe("orderQuery", () => {
  it("reproduce los filtros y la página", () => {
    const filters = parseOrderFilters({
      state: ["PENDING", "CANCELED"],
      city: "3",
      page: "3",
    });
    expect(orderQuery(filters)).toBe(
      "?state=PENDING&state=CANCELED&city=3&page=3",
    );
    expect(orderQuery(filters, 1)).toBe("?state=PENDING&state=CANCELED&city=3");
  });
});

describe("zoneOrderWhere", () => {
  it("sin estados elegidos deja afuera los cancelados", () => {
    expect(zoneOrderWhere(NO_ZONE_FILTERS).state).toEqual({
      not: "CANCELED",
    });
  });

  it("con estados elegidos usa esos, aunque incluyan Cancelado", () => {
    const filters = parseOrderFilters({ state: "CANCELED", city: "3" });
    expect(zoneOrderWhere(filters)).toMatchObject({
      state: { in: ["CANCELED"] },
      address: { cityId: 3 },
    });
  });

  it("ignora número, fechas y página: el período lo pone la vista", () => {
    const where = zoneOrderWhere(
      parseOrderFilters({ number: "5", from: "2026-10-01", page: "2" }),
    );
    expect(where.number).toBeUndefined();
    expect(where.createdAt).toBeUndefined();
  });
});

describe("zoneFilterParams", () => {
  it("devuelve solo los filtros que aplican a la vista por zona", () => {
    expect(
      zoneFilterParams(
        parseOrderFilters({
          state: ["PENDING", "PREPARING"],
          product: "prodbolsa15",
          number: "5",
          from: "2026-10-01",
          page: "2",
        }),
      ),
    ).toEqual([
      ["state", "PENDING"],
      ["state", "PREPARING"],
      ["product", "prodbolsa15"],
    ]);
  });
});
