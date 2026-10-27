import { describe, expect, it } from "vitest";
import { finalPrice } from "./price";

describe("finalPrice", () => {
  it("suma el IVA al neto", () => {
    // Alimento balanceado adulto 15 kg, IVA 10,5%.
    expect(finalPrice("25000", "0.105")).toBe("27625.00");
    // Correa extensible, IVA 21%.
    expect(finalPrice("8500.50", "0.21")).toBe("10285.61");
  });

  it("redondea a centavos, la mitad hacia arriba", () => {
    // 0.05 × 1.105 = 0.05525 → 0.06
    expect(finalPrice("0.05", "0.105")).toBe("0.06");
    // 10.01 × 1.21 = 12.1121 → 12.11
    expect(finalPrice("10.01", "0.21")).toBe("12.11");
  });

  it("exento queda igual y acepta valores tipo Decimal", () => {
    expect(finalPrice({ toString: () => "1500.5" }, "0")).toBe("1500.50");
  });

  it("no pierde precisión con montos grandes", () => {
    expect(finalPrice("9999999999.99", "0.27")).toBe("12699999999.99");
  });
});
