import { describe, expect, it } from "vitest";
import {
  applyCountEntry,
  countDifference,
  matchProductByCode,
  normalizeCountCode,
  parseCountEntry,
  parseCountRequest,
  quantityFitsUnit,
  summarizeCount,
} from "./stock-count";

const t = {
  warehouse: "warehouse",
  notes: "notes",
  code: "code",
  quantity: "quantity",
} as never;

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
};

describe("normalizeCountCode", () => {
  it("saca espacios y saltos de línea del lector", () => {
    expect(normalizeCountCode(" 7791234 567890\n")).toBe("7791234567890");
  });
});

describe("matchProductByCode", () => {
  const products = [
    { id: "a", barcode: "7791234567890", sku: "ALI-001" },
    { id: "b", barcode: null, sku: "7791234567890" },
    { id: "c", barcode: null, sku: "PAT-002" },
  ];

  it("encuentra por código de barras antes que por SKU", () => {
    expect(matchProductByCode("7791234567890", products)?.id).toBe("a");
  });

  it("encuentra por SKU sin importar mayúsculas", () => {
    expect(matchProductByCode("pat-002", products)?.id).toBe("c");
  });

  it("no inventa coincidencias parciales ni vacías", () => {
    expect(matchProductByCode("PAT", products)).toBeNull();
    expect(matchProductByCode("  ", products)).toBeNull();
  });
});

describe("parseCountRequest", () => {
  const warehouseId = "clx0warehouse0000000001";

  it("acepta depósito y nota opcional", () => {
    expect(
      parseCountRequest(form({ warehouseId, notes: " Pasillo A " }), t),
    ).toEqual({ ok: true, data: { warehouseId, notes: "Pasillo A" } });
    expect(parseCountRequest(form({ warehouseId }), t)).toEqual({
      ok: true,
      data: { warehouseId, notes: null },
    });
  });

  it("rechaza depósito inválido y nota larga", () => {
    expect(parseCountRequest(form({ warehouseId: "no valido!" }), t)).toEqual({
      ok: false,
      error: "warehouse",
    });
    expect(
      parseCountRequest(form({ warehouseId, notes: "x".repeat(301) }), t),
    ).toEqual({ ok: false, error: "notes" });
  });
});

describe("parseCountEntry", () => {
  it("suma por defecto y acepta coma decimal", () => {
    expect(
      parseCountEntry(form({ code: "ALI-001", quantity: "2,5" }), t),
    ).toEqual({
      ok: true,
      data: { code: "ALI-001", mode: "add", quantity: "2.5" },
    });
  });

  it("no deja sumar cero pero sí fijar cero", () => {
    expect(
      parseCountEntry(form({ code: "A", quantity: "0", mode: "add" }), t),
    ).toEqual({ ok: false, error: "quantity" });
    expect(
      parseCountEntry(form({ code: "A", quantity: "0", mode: "set" }), t),
    ).toMatchObject({ ok: true, data: { mode: "set", quantity: "0" } });
  });

  it("rechaza código vacío, cantidad negativa o con letras", () => {
    expect(parseCountEntry(form({ code: " ", quantity: "1" }), t)).toEqual({
      ok: false,
      error: "code",
    });
    expect(parseCountEntry(form({ code: "A", quantity: "-1" }), t)).toEqual({
      ok: false,
      error: "quantity",
    });
    expect(parseCountEntry(form({ code: "A", quantity: "dos" }), t)).toEqual({
      ok: false,
      error: "quantity",
    });
  });
});

describe("quantityFitsUnit", () => {
  it("una unidad sin decimales solo admite enteros", () => {
    expect(quantityFitsUnit("3", false)).toBe(true);
    expect(quantityFitsUnit("3.5", false)).toBe(false);
    expect(quantityFitsUnit("3.5", true)).toBe(true);
  });
});

describe("applyCountEntry", () => {
  it("el primer escaneo fija y los siguientes suman", () => {
    expect(applyCountEntry(null, { mode: "add", quantity: "1" })).toBe("1");
    expect(applyCountEntry("1", { mode: "add", quantity: "2.5" })).toBe("3.5");
  });

  it("fijar reemplaza lo contado", () => {
    expect(applyCountEntry("10", { mode: "set", quantity: "4" })).toBe("4");
  });
});

describe("countDifference y summarizeCount", () => {
  it("la diferencia es contado menos esperado, con signo", () => {
    expect(countDifference("8", "10")).toBe("-2");
    expect(countDifference("10.5", "10")).toBe("0.5");
    expect(countDifference("3", "3")).toBe("0");
    expect(countDifference("2", "-1")).toBe("3");
  });

  it("cuenta coincidencias, sobrantes y faltantes", () => {
    expect(
      summarizeCount([
        { counted: "5", expected: "5" },
        { counted: "6", expected: "5" },
        { counted: "1", expected: "5" },
        { counted: "0", expected: "2" },
      ]),
    ).toEqual({ total: 4, matching: 1, surplus: 1, missing: 2 });
  });
});
