import { describe, expect, it } from "vitest";
import { es } from "@/i18n/dictionaries/es";
import { validateWarehouseForm } from "./warehouse";

const t = es.warehouses.errors;

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

const valid = {
  name: " Depósito Central ",
  address: "Av. Mitre 1234",
  cityId: "3",
  phone: "",
  contactName: " Carla (alimentos balanceados) ",
  isActive: "on",
};

describe("validateWarehouseForm", () => {
  it("recorta textos, convierte la localidad y guarda opcionales vacíos como null", () => {
    expect(validateWarehouseForm(form(valid), t)).toMatchObject({
      ok: true,
      data: {
        name: "Depósito Central",
        address: "Av. Mitre 1234",
        cityId: 3,
        phone: null,
        contactName: "Carla (alimentos balanceados)",
        isActive: true,
      },
    });
  });

  it("sin el checkbox queda inactivo", () => {
    const data = form(valid);
    data.delete("isActive");
    expect(validateWarehouseForm(data, t)).toMatchObject({
      ok: true,
      data: { isActive: false },
    });
  });

  it("exige nombre, dirección y localidad, y devuelve lo cargado", () => {
    const result = validateWarehouseForm(
      form({ ...valid, name: " ", address: "", cityId: "" }),
      t,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.state.errors).toMatchObject({
      name: [t.nameRequired],
      address: [t.addressRequired],
      cityId: [t.cityRequired],
    });
    expect(result.state.values).toMatchObject({ name: " ", isActive: true });
  });

  it("rechaza una localidad que no es un id", () => {
    const result = validateWarehouseForm(form({ ...valid, cityId: "abc" }), t);
    expect(result).toMatchObject({
      ok: false,
      state: { errors: { cityId: [t.cityRequired] } },
    });
  });

  it("limita el largo de los textos", () => {
    const result = validateWarehouseForm(
      form({ ...valid, phone: "1".repeat(31) }),
      t,
    );
    expect(result).toMatchObject({
      ok: false,
      state: { errors: { phone: ["Máximo 30 caracteres"] } },
    });
  });
});
