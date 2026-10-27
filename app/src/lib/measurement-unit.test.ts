import { describe, expect, it } from "vitest";
import { es } from "@/i18n/dictionaries/es";
import { parseUnitId, validateMeasurementUnitForm } from "./measurement-unit";

const t = es.measurementUnits.errors;

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

describe("validateMeasurementUnitForm", () => {
  it("recorta espacios y guarda la descripción vacía como null", () => {
    const result = validateMeasurementUnitForm(
      form({ name: "  kg ", description: "   " }),
      t,
    );
    expect(result).toMatchObject({
      ok: true,
      data: { name: "kg", description: null },
    });
  });

  it("acepta una descripción", () => {
    const result = validateMeasurementUnitForm(
      form({ name: "l", description: "Litro" }),
      t,
    );
    expect(result).toMatchObject({
      ok: true,
      data: { name: "l", description: "Litro" },
    });
  });

  it("exige el nombre y devuelve lo tipeado", () => {
    const result = validateMeasurementUnitForm(
      form({ name: " ", description: "x" }),
      t,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.state.errors?.name).toEqual(["El nombre es obligatorio"]);
    expect(result.state.values).toEqual({ name: " ", description: "x" });
  });

  it("rechaza textos demasiado largos", () => {
    const result = validateMeasurementUnitForm(
      form({ name: "a".repeat(21), description: "b".repeat(101) }),
      t,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.state.errors?.name).toBeDefined();
    expect(result.state.errors?.description).toBeDefined();
  });

  it("trata los campos faltantes como vacíos", () => {
    const result = validateMeasurementUnitForm(new FormData(), t);
    expect(result.ok).toBe(false);
  });
});

describe("parseUnitId", () => {
  it("acepta enteros positivos", () => {
    expect(parseUnitId("3")).toBe(3);
    expect(parseUnitId(7)).toBe(7);
  });

  it("rechaza ids inválidos", () => {
    expect(parseUnitId("abc")).toBeNull();
    expect(parseUnitId("1.5")).toBeNull();
    expect(parseUnitId("0")).toBeNull();
    expect(parseUnitId("")).toBeNull();
    expect(parseUnitId("9999999999")).toBeNull();
  });
});
