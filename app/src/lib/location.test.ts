import { describe, expect, it } from "vitest";
import { es } from "@/i18n/dictionaries/es";
import {
  parseLocationId,
  validateCityForm,
  validateStateForm,
} from "./location";

const t = es.locations.errors;

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

describe("validateStateForm", () => {
  it("recorta el nombre", () => {
    expect(validateStateForm(form({ name: "  Santa Fe " }), t)).toMatchObject({
      ok: true,
      data: { name: "Santa Fe" },
    });
  });

  it("exige el nombre y limita el largo", () => {
    expect(validateStateForm(form({ name: " " }), t)).toMatchObject({
      ok: false,
      state: { errors: { name: [t.nameRequired] } },
    });
    expect(validateStateForm(form({ name: "x".repeat(81) }), t)).toMatchObject({
      ok: false,
      state: { errors: { name: ["Máximo 80 caracteres"] } },
    });
  });
});

describe("validateCityForm", () => {
  it("lee la provincia como número", () => {
    expect(
      validateCityForm(form({ name: " Morón ", stateId: "1" }), t),
    ).toMatchObject({ ok: true, data: { name: "Morón", stateId: 1 } });
  });

  it("exige la provincia y devuelve lo cargado", () => {
    const result = validateCityForm(form({ name: "Morón", stateId: "" }), t);
    expect(result).toMatchObject({
      ok: false,
      state: {
        errors: { stateId: [t.stateRequired] },
        values: { name: "Morón", stateId: "" },
      },
    });
  });
});

describe("parseLocationId", () => {
  it("acepta solo enteros positivos", () => {
    expect(parseLocationId("3")).toBe(3);
    expect(parseLocationId("x")).toBeNull();
    expect(parseLocationId("0")).toBeNull();
  });
});
