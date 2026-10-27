import { describe, expect, it } from "vitest";
import { es } from "@/i18n/dictionaries/es";
import {
  fractionToPercent,
  parseTaxRateId,
  percentToFraction,
  validateTaxRateForm,
} from "./tax-rate";

describe("percentToFraction", () => {
  it("convierte porcentajes con coma o punto", () => {
    expect(percentToFraction("21")).toBe("0.2100");
    expect(percentToFraction("10,5")).toBe("0.1050");
    expect(percentToFraction(" 10.5 ")).toBe("0.1050");
    expect(percentToFraction("0")).toBe("0.0000");
    expect(percentToFraction("100")).toBe("1.0000");
    expect(percentToFraction("2,75")).toBe("0.0275");
  });

  it("rechaza lo que no entra en la columna", () => {
    expect(percentToFraction("")).toBeNull();
    expect(percentToFraction("abc")).toBeNull();
    expect(percentToFraction("-5")).toBeNull();
    expect(percentToFraction("100,01")).toBeNull();
    expect(percentToFraction("10,555")).toBeNull();
    expect(percentToFraction("0,21%")).toBeNull();
  });
});

describe("fractionToPercent", () => {
  it("vuelve al porcentaje, también desde un Decimal", () => {
    expect(fractionToPercent("0.105")).toBe(10.5);
    expect(fractionToPercent({ toString: () => "0.2100" })).toBe(21);
    expect(fractionToPercent("0")).toBe(0);
  });
});

describe("validateTaxRateForm", () => {
  const t = es.taxRates.errors;
  const form = (fields: Record<string, string>) => {
    const data = new FormData();
    for (const [key, value] of Object.entries(fields)) data.set(key, value);
    return data;
  };

  it("acepta una alícuota, como la de alimento balanceado", () => {
    expect(
      validateTaxRateForm(
        form({ name: " IVA 10,5% ", percent: "10,5", isActive: "on" }),
        t,
      ),
    ).toMatchObject({
      ok: true,
      data: { name: "IVA 10,5%", rate: "0.1050", isActive: true },
    });
  });

  it("muestra el error del porcentaje en su campo y devuelve lo cargado", () => {
    const result = validateTaxRateForm(form({ name: "", percent: "150" }), t);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.state.errors).toEqual({
      name: [t.nameRequired],
      percent: [t.percentInvalid],
    });
    expect(result.state.values).toEqual({
      name: "",
      percent: "150",
      isActive: false,
    });
  });
});

describe("parseTaxRateId", () => {
  it("acepta solo enteros positivos", () => {
    expect(parseTaxRateId("2")).toBe(2);
    expect(parseTaxRateId("x")).toBeNull();
    expect(parseTaxRateId("0")).toBeNull();
  });
});
