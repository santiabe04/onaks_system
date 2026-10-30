import { describe, expect, it } from "vitest";
import {
  chartMonths,
  parseReportParams,
  reportQuery,
  reportTotals,
  summarizeBy,
  type ReportLine,
} from "./sales-report";

// 30/10/2026 10:00 en Argentina.
const NOW = new Date("2026-10-30T13:00:00Z");

describe("parseReportParams", () => {
  it("sin nada: el mes actual, entregados, por producto", () => {
    expect(parseReportParams({}, NOW)).toMatchObject({
      from: "2026-10-01",
      to: "2026-10-31",
      start: new Date("2026-10-01T03:00:00Z"),
      end: new Date("2026-11-01T03:00:00Z"),
      basis: "delivered",
      tab: "products",
    });
  });

  it("toma el rango, lo ordena y lo recorta a un año", () => {
    expect(
      parseReportParams({ from: "2026-03-31", to: "2026-01-01" }, NOW),
    ).toMatchObject({ from: "2026-01-01", to: "2026-03-31" });
    expect(
      parseReportParams({ from: "2025-01-01", to: "2026-10-30" }, NOW).to,
    ).toBe("2026-01-01");
  });

  it("valores desconocidos vuelven a los de siempre", () => {
    expect(
      parseReportParams({ basis: "todo", tab: "x", from: "ayer" }, NOW),
    ).toMatchObject({
      basis: "delivered",
      tab: "products",
      from: "2026-10-01",
    });
    expect(
      parseReportParams({ basis: "confirmed", tab: "idle" }, NOW),
    ).toMatchObject({ basis: "confirmed", tab: "idle" });
  });

  it("reportQuery reproduce los filtros con cambios", () => {
    const params = parseReportParams({ basis: "confirmed" }, NOW);
    expect(reportQuery(params, { tab: "zones" })).toBe(
      "?from=2026-10-01&to=2026-10-31&basis=confirmed&tab=zones",
    );
  });
});

describe("chartMonths", () => {
  it("los 12 meses que terminan en el de `to`", () => {
    const { months, start, end } = chartMonths(
      parseReportParams({ from: "2026-02-10", to: "2026-03-05" }, NOW),
    );
    expect(months).toHaveLength(12);
    expect(months[0]).toBe("2025-04");
    expect(months[11]).toBe("2026-03");
    expect(start).toEqual(new Date("2025-04-01T03:00:00Z"));
    expect(end).toEqual(new Date("2026-04-01T03:00:00Z"));
  });
});

function line(overrides: Partial<ReportLine>): ReportLine {
  return {
    saleId: "s1",
    productId: "dogfood15kg",
    categoryId: 1,
    customerId: "patitas",
    cityId: 10,
    quantity: "1",
    unitPrice: "100",
    unitCost: "70",
    ...overrides,
  };
}

describe("summarizeBy", () => {
  const lines = [
    line({ quantity: "2", unitPrice: "26000", unitCost: "18200" }),
    line({
      saleId: "s2",
      quantity: "1",
      unitPrice: "23400",
      unitCost: "18200",
    }),
    // Sin costo: suma venta, no margen.
    line({
      saleId: "s2",
      productId: "toyball",
      quantity: "3",
      unitPrice: "1800",
      unitCost: null,
    }),
    // Por kilo, con decimales.
    line({
      saleId: "s3",
      productId: "catloose",
      customerId: "sanroque",
      quantity: "2.5",
      unitPrice: "3333.33",
      unitCost: "2333.33",
    }),
  ];

  it("agrupa por producto con cantidad, pedidos, venta, costo y margen", () => {
    const rows = summarizeBy(lines, (row) => row.productId);
    expect(rows.map((row) => row.key)).toEqual([
      "dogfood15kg",
      "catloose",
      "toyball",
    ]);
    expect(rows[0]).toEqual({
      key: "dogfood15kg",
      quantity: "3",
      orders: 2,
      net: "75400.00",
      cost: "54600.00",
      margin: "20800.00",
      marginRate: 20800 / 75400,
      uncostedNet: "0.00",
    });
    // 3333.33 × 2.5 = 8333.325 → 8333.33; 2333.33 × 2.5 = 5833.325 → 5833.33.
    expect(rows[1]).toMatchObject({
      net: "8333.33",
      cost: "5833.33",
      margin: "2500.00",
    });
    expect(rows[2]).toMatchObject({
      net: "5400.00",
      cost: "0.00",
      margin: "0.00",
      marginRate: null,
      uncostedNet: "5400.00",
    });
  });

  it("los totales cuentan pedidos distintos y dejan afuera del margen lo sin costo", () => {
    expect(reportTotals(lines)).toMatchObject({
      orders: 3,
      net: "89133.33",
      cost: "60433.33",
      margin: "23300.00",
      uncostedNet: "5400.00",
      marginRate: 23300 / 83733.33,
    });
  });

  it("un margen negativo (vendido bajo costo) se informa con signo", () => {
    expect(
      reportTotals([line({ unitPrice: "90", unitCost: "100" })]).margin,
    ).toBe("-10.00");
  });

  it("sin ventas: totales en cero", () => {
    expect(reportTotals([])).toMatchObject({
      orders: 0,
      net: "0.00",
      marginRate: null,
    });
  });
});
