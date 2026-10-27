import { describe, expect, it } from "vitest";
import { formatters } from "./format";

// Intl usa espacios no separables: se normalizan para comparar.
const plain = (value: string) => value.replace(/\s/g, " ");

describe("formatters", () => {
  it("formatea pesos según el idioma", () => {
    expect(plain(formatters("es").money(1234.5))).toBe("$ 1.234,50");
    expect(plain(formatters("en").money("1234.5"))).toBe("ARS 1,234.50");
  });

  it("acepta valores tipo Decimal", () => {
    const decimal = { toString: () => "99.9" };
    expect(plain(formatters("es").money(decimal))).toBe("$ 99,90");
  });

  it("formatea números con separadores locales", () => {
    expect(formatters("es").number(1234.5678)).toBe("1.234,568");
    expect(formatters("en").number(1234.5678)).toBe("1,234.568");
  });

  it("formatea fechas en el orden de cada idioma", () => {
    const date = new Date(2026, 9, 27, 12);
    expect(formatters("es").date(date)).toBe("27/10/26");
    expect(formatters("en").date(date)).toBe("10/27/26");
  });
});
