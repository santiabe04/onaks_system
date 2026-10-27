import { describe, expect, it } from "vitest";
import {
  MEASURE_LIMITS,
  parseDecimalInput,
  PRICE_LIMITS,
} from "./decimal-input";

describe("parseDecimalInput", () => {
  it("acepta coma o punto decimal", () => {
    expect(parseDecimalInput("25000", PRICE_LIMITS)).toBe("25000");
    expect(parseDecimalInput(" 8500,5 ", PRICE_LIMITS)).toBe("8500.5");
    expect(parseDecimalInput("15.250", MEASURE_LIMITS)).toBe("15.250");
    expect(parseDecimalInput("007,5", PRICE_LIMITS)).toBe("7.5");
    expect(parseDecimalInput("0", PRICE_LIMITS)).toBe("0");
  });

  it("rechaza negativos, texto, miles y lo que no entra en la columna", () => {
    expect(parseDecimalInput("", PRICE_LIMITS)).toBeNull();
    expect(parseDecimalInput("-5", PRICE_LIMITS)).toBeNull();
    expect(parseDecimalInput("abc", PRICE_LIMITS)).toBeNull();
    expect(parseDecimalInput("1.250,50", PRICE_LIMITS)).toBeNull();
    expect(parseDecimalInput("10,555", PRICE_LIMITS)).toBeNull();
    expect(parseDecimalInput("12345678901", PRICE_LIMITS)).toBeNull();
    expect(parseDecimalInput("1,2345", MEASURE_LIMITS)).toBeNull();
  });
});
