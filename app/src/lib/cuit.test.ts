import { describe, expect, it } from "vitest";
import { isValidCuit, normalizeCuit } from "./cuit";

describe("normalizeCuit", () => {
  it("saca guiones y espacios", () => {
    expect(normalizeCuit("30-71234567-1 ")).toBe("30712345671");
  });
});

describe("isValidCuit", () => {
  it("acepta un CUIT con dígito verificador correcto", () => {
    expect(isValidCuit("20-12345678-6")).toBe(true);
    expect(isValidCuit("30500010912")).toBe(true);
  });

  it("rechaza un dígito verificador incorrecto", () => {
    expect(isValidCuit("20123456780")).toBe(false);
  });

  it("rechaza formatos inválidos", () => {
    expect(isValidCuit("2012345678")).toBe(false);
    expect(isValidCuit("2012345678a")).toBe(false);
    expect(isValidCuit("")).toBe(false);
  });
});
