import { describe, expect, it } from "vitest";
import { es } from "@/i18n/dictionaries/es";
import { validateDriverForm, validateVehicleForm } from "./fleet";

const t = es.fleet.errors;

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

describe("validateDriverForm", () => {
  it("acepta un repartidor con usuario vinculado", () => {
    expect(
      validateDriverForm(
        form({
          name: "  Juan Pérez ",
          phone: "11 5555-1234",
          userId: "userjuan",
          isActive: "on",
        }),
        t,
      ),
    ).toMatchObject({
      ok: true,
      data: {
        name: "Juan Pérez",
        phone: "11 5555-1234",
        userId: "userjuan",
        isActive: true,
      },
    });
  });

  it("sin usuario ni teléfono guarda null, y sin tildar queda inactivo", () => {
    expect(
      validateDriverForm(form({ name: "Juan", phone: " ", userId: "" }), t),
    ).toMatchObject({
      ok: true,
      data: { phone: null, userId: null, isActive: false },
    });
  });

  it("exige el nombre y devuelve lo cargado", () => {
    const result = validateDriverForm(form({ name: " ", phone: "123" }), t);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.state.errors?.name).toEqual([t.nameRequired]);
    expect(result.state.values?.phone).toBe("123");
  });
});

describe("validateVehicleForm", () => {
  it("normaliza la patente y lee capacidades con coma decimal", () => {
    expect(
      validateVehicleForm(
        form({
          name: "Kangoo blanca",
          plate: "ab 123 cd",
          capacityKg: "650,5",
          capacityLiters: "3000",
          isActive: "on",
        }),
        t,
      ),
    ).toMatchObject({
      ok: true,
      data: {
        name: "Kangoo blanca",
        plate: "AB123CD",
        capacityKg: "650.5",
        capacityLiters: "3000",
        isActive: true,
      },
    });
  });

  it("la capacidad es opcional pero, si está, mayor a 0", () => {
    expect(
      validateVehicleForm(
        form({ name: "Moto", capacityKg: "", capacityLiters: "" }),
        t,
      ),
    ).toMatchObject({ ok: true, data: { capacityKg: null, plate: null } });
    const result = validateVehicleForm(
      form({ name: "Moto", capacityKg: "0", capacityLiters: "abc" }),
      t,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.state.errors?.capacityKg).toEqual([t.capacity]);
    expect(result.state.errors?.capacityLiters).toEqual([t.capacity]);
  });
});
