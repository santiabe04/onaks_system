import { describe, expect, it } from "vitest";
import { es } from "@/i18n/dictionaries/es";
import {
  formatInvoiceNumber,
  invoicedQuantities,
  invoiceTotals,
  isNewerCost,
  matchInvoice,
  parseInvoiceHeader,
  parseInvoiceLines,
  pendingToInvoice,
} from "./supplier-invoice";

const t = es.invoices.errors;
const DOG_FOOD = "dogfood15kg";
const BULK_CAT = "catfoodbulk";

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

const header = {
  type: "A",
  pointOfSale: "3",
  number: "12345",
  issueDate: "2026-10-28",
  printedTotal: "224730.50",
};

describe("formatInvoiceNumber", () => {
  it("rellena punto de venta y número", () => {
    expect(
      formatInvoiceNumber({ type: "A", pointOfSale: 3, number: 12345 }),
    ).toBe("A 00003-00012345");
  });
});

describe("pendingToInvoice", () => {
  it("es lo recibido menos lo facturado, sin bajar de 0", () => {
    expect(pendingToInvoice("10", "6")).toBe("4");
    expect(pendingToInvoice("10", "12")).toBe("0");
  });
});

describe("invoicedQuantities", () => {
  it("suma por producto y saltea las anuladas", () => {
    const totals = invoicedQuantities([
      { state: "APPROVED", items: [{ productId: DOG_FOOD, quantity: "4" }] },
      {
        state: "FLAGGED",
        items: [
          { productId: DOG_FOOD, quantity: "2" },
          { productId: BULK_CAT, quantity: "2.5" },
        ],
      },
      { state: "ANNULLED", items: [{ productId: DOG_FOOD, quantity: "9" }] },
    ]);
    expect(Object.fromEntries(totals)).toEqual({
      [DOG_FOOD]: "6",
      [BULK_CAT]: "2.5",
    });
  });
});

describe("parseInvoiceHeader", () => {
  it("lee el comprobante, las percepciones (en blanco son 0) y el total", () => {
    expect(
      parseInvoiceHeader(
        form({ ...header, dueDate: "2026-11-27", iibbPerception: "1500,25" }),
        t,
      ),
    ).toEqual({
      ok: true,
      data: {
        type: "A",
        pointOfSale: 3,
        number: 12345,
        issueDate: "2026-10-28",
        dueDate: "2026-11-27",
        vatPerception: "0",
        iibbPerception: "1500.25",
        otherTaxes: "0",
        printedTotal: "224730.50",
        notes: null,
      },
    });
  });

  it("rechaza tipo, número, vencimiento y total inválidos", () => {
    expect(parseInvoiceHeader(form({ ...header, type: "X" }), t)).toEqual({
      ok: false,
      error: t.type,
    });
    expect(
      parseInvoiceHeader(form({ ...header, pointOfSale: "123456" }), t),
    ).toEqual({ ok: false, error: t.number });
    expect(parseInvoiceHeader(form({ ...header, number: "0" }), t)).toEqual({
      ok: false,
      error: t.number,
    });
    expect(
      parseInvoiceHeader(form({ ...header, dueDate: "2026-10-01" }), t),
    ).toEqual({ ok: false, error: t.dueDate });
    expect(
      parseInvoiceHeader(form({ ...header, printedTotal: "" }), t),
    ).toEqual({ ok: false, error: t.printedTotal });
  });
});

describe("parseInvoiceLines", () => {
  const products = [
    { productId: DOG_FOOD, allowsDecimals: false },
    { productId: BULK_CAT, allowsDecimals: true },
  ];

  it("toma las líneas con cantidad y exige el costo", () => {
    expect(
      parseInvoiceLines(
        form({
          [`qty_${DOG_FOOD}`]: "6",
          [`cost_${DOG_FOOD}`]: "18500",
          [`qty_${BULK_CAT}`]: "",
        }),
        products,
        t,
      ),
    ).toEqual({
      ok: true,
      lines: [{ productId: DOG_FOOD, quantity: "6", unitCost: "18500" }],
    });
    expect(
      parseInvoiceLines(form({ [`qty_${BULK_CAT}`]: "2,5" }), products, t),
    ).toEqual({ ok: false, error: t.cost });
    expect(parseInvoiceLines(form({}), products, t)).toEqual({
      ok: false,
      error: t.noLines,
    });
  });
});

describe("invoiceTotals", () => {
  it("suma neto, IVA por alícuota y percepciones", () => {
    expect(
      invoiceTotals(
        [
          { quantity: "6", unitCost: "18500", taxRate: "0.105" },
          { quantity: "12", unitCost: "2900", taxRate: "0.21" },
        ],
        { vatPerception: "1000", iibbPerception: "500.50", otherTaxes: "0" },
      ),
    ).toEqual({ net: "145800.00", tax: "18963.00", total: "166263.50" });
  });
});

describe("matchInvoice", () => {
  const order = [
    { productId: DOG_FOOD, unitCost: "18500", received: "10", invoiced: "4" },
    { productId: BULK_CAT, unitCost: "2900", received: "12", invoiced: "0" },
  ];

  it("sin diferencias si coincide costo, cantidad y total", () => {
    expect(
      matchInvoice({
        lines: [{ productId: DOG_FOOD, quantity: "6", unitCost: "18500.00" }],
        order,
        computedTotal: "122655.00",
        printedTotal: "122655",
      }),
    ).toEqual([]);
  });

  it("marca costo distinto, más de lo recibido y total que no cierra", () => {
    expect(
      matchInvoice({
        lines: [
          { productId: DOG_FOOD, quantity: "7", unitCost: "18500" },
          { productId: BULK_CAT, quantity: "12", unitCost: "3050" },
        ],
        order,
        computedTotal: "187388.00",
        printedTotal: "187390.00",
      }),
    ).toEqual([
      { kind: "QUANTITY", productId: DOG_FOOD, expected: "6", actual: "7" },
      {
        kind: "PRICE",
        productId: BULK_CAT,
        expected: "2900.00",
        actual: "3050.00",
      },
      { kind: "TOTAL", expected: "187388.00", actual: "187390.00" },
    ]);
  });
});

describe("isNewerCost", () => {
  it("actualiza si no hay costo o la factura no es anterior", () => {
    expect(isNewerCost("2026-10-28", null)).toBe(true);
    expect(isNewerCost("2026-10-28", new Date("2026-10-28T15:00:00Z"))).toBe(
      true,
    );
    expect(isNewerCost("2026-10-20", new Date("2026-10-28T15:00:00Z"))).toBe(
      false,
    );
  });
});
