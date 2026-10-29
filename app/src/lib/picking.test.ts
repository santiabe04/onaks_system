import { describe, expect, it } from "vitest";
import { es } from "@/i18n/dictionaries/es";
import {
  compareLocations,
  normalizeLocation,
  parsePicked,
  parsePickingRequest,
  pickingRoute,
} from "./picking";

const t = es.picking.errors;
const DOG_FOOD = "dogfood15kg";
const CAT_LITTER = "catlitter10kg";
const BULK_SEED = "birdseedbulk";
const SALE_A = "salepetshopa";
const SALE_B = "salepetshopb";

function form(entries: [string, string][]) {
  const data = new FormData();
  for (const [key, value] of entries) data.append(key, value);
  return data;
}

describe("normalizeLocation", () => {
  it("pasa a mayúsculas, limpia espacios y limita el largo", () => {
    expect(normalizeLocation("  a-03-2 ")).toBe("A-03-2");
    expect(normalizeLocation("")).toBe("");
    expect(normalizeLocation("x".repeat(31))).toBeNull();
  });
});

describe("compareLocations", () => {
  it("ordena en forma natural y deja sin ubicación al final", () => {
    const sorted = ["A-10", null, "A-2", "B-1"].sort(compareLocations);
    expect(sorted).toEqual(["A-2", "A-10", "B-1", null]);
  });
});

describe("parsePickingRequest", () => {
  it("lee depósito, pedidos sin repetir y comentario", () => {
    expect(
      parsePickingRequest(
        form([
          ["warehouseId", "warehousesouth"],
          ["sale", SALE_A],
          ["sale", `${SALE_B}:PENDING`],
          ["sale", SALE_A],
          ["notes", " Turno mañana "],
        ]),
        t,
      ),
    ).toEqual({
      ok: true,
      data: {
        warehouseId: "warehousesouth",
        saleIds: [SALE_A, SALE_B],
        notes: "Turno mañana",
      },
    });
  });

  it("exige depósito y al menos un pedido", () => {
    expect(parsePickingRequest(form([["sale", SALE_A]]), t)).toEqual({
      ok: false,
      error: t.warehouse,
    });
    expect(
      parsePickingRequest(form([["warehouseId", "warehousesouth"]]), t),
    ).toEqual({ ok: false, error: t.noSales });
  });
});

describe("pickingRoute", () => {
  const line = (
    saleId: string,
    saleNumber: number,
    productId: string,
    name: string,
    location: string | null,
    quantity: string,
  ) => ({
    saleId,
    saleNumber,
    productId,
    name,
    sku: name,
    unit: "u",
    location,
    quantity,
  });

  it("suma por producto, detalla los pedidos y ordena por ubicación", () => {
    const route = pickingRoute([
      line(SALE_B, 12, DOG_FOOD, "Alimento perro", "A-10", "2"),
      line(SALE_A, 11, DOG_FOOD, "Alimento perro", "A-10", "3"),
      line(SALE_A, 11, CAT_LITTER, "Arena gato", "A-2", "1"),
      line(SALE_A, 11, BULK_SEED, "Alpiste", null, "2.5"),
    ]);
    expect(route.map((stop) => [stop.name, stop.total])).toEqual([
      ["Arena gato", "1"],
      ["Alimento perro", "5"],
      ["Alpiste", "2.5"],
    ]);
    expect(route[1].orders).toEqual([
      { saleNumber: 11, quantity: "3" },
      { saleNumber: 12, quantity: "2" },
    ]);
  });
});

describe("parsePicked", () => {
  const items = [
    {
      saleId: SALE_A,
      saleNumber: 11,
      productId: DOG_FOOD,
      quantity: "3",
      allowsDecimals: false,
    },
    {
      saleId: SALE_A,
      saleNumber: 11,
      productId: BULK_SEED,
      quantity: "2.5",
      allowsDecimals: true,
    },
    {
      saleId: SALE_B,
      saleNumber: 12,
      productId: DOG_FOOD,
      quantity: "2",
      allowsDecimals: false,
    },
  ];

  it("toma lo preparado y arma los faltantes por pedido", () => {
    const result = parsePicked(
      form([
        [`picked_${SALE_A}_${DOG_FOOD}`, "2"],
        [`reason_${SALE_A}_${DOG_FOOD}`, "WRITTEN_OFF"],
        [`picked_${SALE_A}_${BULK_SEED}`, "2,5"],
        [`picked_${SALE_B}_${DOG_FOOD}`, "2"],
      ]),
      items,
      t,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.lines).toEqual([
      {
        saleId: SALE_A,
        productId: DOG_FOOD,
        picked: "2",
        reason: "WRITTEN_OFF",
      },
      { saleId: SALE_A, productId: BULK_SEED, picked: "2.5", reason: null },
      { saleId: SALE_B, productId: DOG_FOOD, picked: "2", reason: null },
    ]);
    expect(Object.fromEntries(result.shortages)).toEqual({
      [SALE_A]: [
        {
          productId: DOG_FOOD,
          ordered: "3",
          delivered: "2",
          missing: "1",
          reason: "WRITTEN_OFF",
        },
      ],
    });
  });

  it("pide motivo, no deja pasarse y no deja un pedido vacío", () => {
    // Todo preparado, salvo lo que se pisa.
    const full = (overrides: [string, string][]) =>
      form(
        Object.entries({
          [`picked_${SALE_A}_${DOG_FOOD}`]: "3",
          [`picked_${SALE_A}_${BULK_SEED}`]: "2.5",
          [`picked_${SALE_B}_${DOG_FOOD}`]: "2",
          ...Object.fromEntries(overrides),
        }),
      );
    expect(
      parsePicked(full([[`picked_${SALE_A}_${DOG_FOOD}`, "1"]]), items, t),
    ).toEqual({ ok: false, error: t.reason });
    expect(
      parsePicked(full([[`picked_${SALE_A}_${DOG_FOOD}`, "4"]]), items, t),
    ).toEqual({ ok: false, error: t.pickedTooMuch });
    const empty = form([
      [`picked_${SALE_A}_${DOG_FOOD}`, "3"],
      [`picked_${SALE_A}_${BULK_SEED}`, "2.5"],
      [`picked_${SALE_B}_${DOG_FOOD}`, "0"],
      [`reason_${SALE_B}_${DOG_FOOD}`, "MISSING"],
    ]);
    expect(parsePicked(empty, items, t)).toEqual({
      ok: false,
      error: es.picking.errors.emptyOrder.replace("{number}", "12"),
    });
  });
});
