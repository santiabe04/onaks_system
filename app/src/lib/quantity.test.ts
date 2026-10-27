import { describe, expect, it } from "vitest";
import { fromMilli, toMilli } from "./quantity";

describe("toMilli / fromMilli", () => {
  it("convierte ida y vuelta sin ceros de más", () => {
    expect(toMilli("12.5")).toBe(BigInt(12500));
    expect(toMilli("-3.250")).toBe(BigInt(-3250));
    expect(toMilli({ toString: () => "0" })).toBe(BigInt(0));
    expect(fromMilli(BigInt(12500))).toBe("12.5");
    expect(fromMilli(BigInt(-3250))).toBe("-3.25");
    expect(fromMilli(BigInt(-5))).toBe("-0.005");
    expect(fromMilli(BigInt(0))).toBe("0");
  });

  it("suma sin errores de coma flotante", () => {
    // 0.1 + 0.2 con floats da 0.30000000000000004.
    expect(fromMilli(toMilli("0.1") + toMilli("0.2"))).toBe("0.3");
  });
});
