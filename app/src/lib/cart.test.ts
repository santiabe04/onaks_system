import { describe, expect, it } from "vitest";
import { cartTotals, lineTotals, parseCartQuantity } from "./cart";

describe("parseCartQuantity", () => {
  it("con unidades enteras solo acepta enteros positivos", () => {
    expect(parseCartQuantity("3", false)).toBe("3");
    expect(parseCartQuantity("1,5", false)).toBeNull();
    expect(parseCartQuantity("0", false)).toBeNull();
    expect(parseCartQuantity("-2", false)).toBeNull();
  });

  it("a granel acepta hasta 3 decimales con coma o punto", () => {
    expect(parseCartQuantity("12,5", true)).toBe("12.5");
    expect(parseCartQuantity("0.250", true)).toBe("0.25");
    expect(parseCartQuantity("1,2345", true)).toBeNull();
    expect(parseCartQuantity("0,000", true)).toBeNull();
  });
});

describe("lineTotals", () => {
  it("neto por cantidad y el IVA sobre ese neto", () => {
    // 2 bolsas de alimento de $25.000 con IVA 10,5%.
    expect(
      lineTotals({
        price: "25000",
        rate: "0.105",
        quantity: "2",
        weight: "15",
      }),
    ).toEqual({
      net: "50000.00",
      tax: "5250.00",
      total: "55250.00",
    });
  });

  it("redondea a centavos con cantidades a granel", () => {
    // 1,25 kg a $4.000,99: neto 5001,2375 → 5001,24; IVA 21% = 1050,26.
    expect(
      lineTotals({
        price: "4000.99",
        rate: "0.21",
        quantity: "1.25",
        weight: "1",
      }),
    ).toEqual({ net: "5001.24", tax: "1050.26", total: "6051.50" });
  });
});

describe("cartTotals", () => {
  it("suma las líneas ya redondeadas y el peso total", () => {
    expect(
      cartTotals([
        { price: "25000", rate: "0.105", quantity: "2", weight: "15" },
        { price: "8500.5", rate: "0.21", quantity: "1", weight: "0.4" },
        { price: "4000", rate: "0.105", quantity: "2.5", weight: "1" },
      ]),
    ).toEqual({
      net: "68500.50",
      tax: "8085.11",
      total: "76585.61",
      weight: "32.9",
    });
  });

  it("vacío da todo en cero", () => {
    expect(cartTotals([])).toEqual({
      net: "0.00",
      tax: "0.00",
      total: "0.00",
      weight: "0",
    });
  });
});
