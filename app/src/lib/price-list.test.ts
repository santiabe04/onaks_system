import { describe, expect, it } from "vitest";
import { es } from "@/i18n/dictionaries/es";
import {
  adjustmentToFraction,
  discountToFraction,
  parseFixedPrices,
  validatePriceListForm,
} from "./price-list";

const t = es.priceLists.errors;

function form(entries: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.set(key, value);
  return data;
}

describe("adjustmentToFraction", () => {
  it("acepta signo y coma o punto decimal", () => {
    expect(adjustmentToFraction("-10")).toBe("-0.1000");
    expect(adjustmentToFraction("+15,5")).toBe("0.1550");
    expect(adjustmentToFraction("2.25")).toBe("0.0225");
    expect(adjustmentToFraction("0")).toBe("0.0000");
    expect(adjustmentToFraction("-0")).toBe("0.0000");
    expect(adjustmentToFraction("999,99")).toBe("9.9999");
  });

  it("rechaza -100 % o menos, más de 2 decimales y texto", () => {
    expect(adjustmentToFraction("-100")).toBeNull();
    expect(adjustmentToFraction("-99,99")).toBe("-0.9999");
    expect(adjustmentToFraction("1000")).toBeNull();
    expect(adjustmentToFraction("10,555")).toBeNull();
    expect(adjustmentToFraction("diez")).toBeNull();
    expect(adjustmentToFraction("")).toBeNull();
  });
});

describe("discountToFraction", () => {
  it("vacío es sin descuento y acepta hasta 99,99 %", () => {
    expect(discountToFraction("")).toBe("0");
    expect(discountToFraction("5")).toBe("0.0500");
    expect(discountToFraction("2,5")).toBe("0.0250");
    expect(discountToFraction("99,99")).toBe("0.9999");
  });

  it("rechaza 100 % o más y negativos", () => {
    expect(discountToFraction("100")).toBeNull();
    expect(discountToFraction("-5")).toBeNull();
  });
});

describe("validatePriceListForm", () => {
  it("recorta el nombre y convierte el ajuste", () => {
    expect(
      validatePriceListForm(
        form({ name: " Mayorista ", adjustment: "-10" }),
        t,
      ),
    ).toMatchObject({
      ok: true,
      data: { name: "Mayorista", adjustment: "-0.1000" },
    });
  });

  it("marca los campos inválidos y devuelve lo cargado", () => {
    const result = validatePriceListForm(
      form({ name: "", adjustment: "-150" }),
      t,
    );
    expect(result).toMatchObject({
      ok: false,
      state: {
        errors: { name: [t.nameRequired], adjustment: [t.adjustmentInvalid] },
        values: { name: "", adjustment: "-150" },
      },
    });
  });
});

describe("parseFixedPrices", () => {
  it("vacío quita el precio fijo; con número lo guarda", () => {
    expect(
      parseFixedPrices(
        form({ price_a: "5000", price_b: "", price_c: "1250,5" }),
        ["a", "b", "c", "d"],
        t,
      ),
    ).toEqual({
      ok: true,
      prices: [
        { productId: "a", price: "5000" },
        { productId: "b", price: null },
        { productId: "c", price: "1250.5" },
      ],
    });
  });

  it("rechaza ceros y texto", () => {
    expect(parseFixedPrices(form({ price_a: "0" }), ["a"], t)).toEqual({
      ok: false,
      error: t.priceInvalid,
    });
    expect(parseFixedPrices(form({ price_a: "x" }), ["a"], t).ok).toBe(false);
  });
});
