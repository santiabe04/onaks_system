import { describe, expect, it } from "vitest";
import { es } from "@/i18n/dictionaries/es";
import { isProductId, validateProductForm } from "./product";

const t = es.products.errors;

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

const valid = {
  name: " Alimento balanceado perro adulto 15 kg ",
  sku: " ali-per-ad-15 ",
  barcode: "7790000000017",
  description: "",
  categoryId: "3",
  measurementUnitId: "1",
  taxRateId: "2",
  price: "25000,50",
  weight: "15",
  volume: "",
  isActive: "on",
};

describe("validateProductForm", () => {
  it("normaliza textos, SKU en mayúsculas, decimales con coma y opcionales vacíos a null", () => {
    expect(validateProductForm(form(valid), t)).toMatchObject({
      ok: true,
      data: {
        name: "Alimento balanceado perro adulto 15 kg",
        sku: "ALI-PER-AD-15",
        barcode: "7790000000017",
        description: null,
        categoryId: 3,
        measurementUnitId: 1,
        taxRateId: 2,
        price: "25000.50",
        weight: "15",
        volume: null,
        isActive: true,
      },
    });
  });

  it("acepta volumen en litros y producto pausado", () => {
    const data = form({ ...valid, volume: "25,5" });
    data.delete("isActive");
    expect(validateProductForm(data, t)).toMatchObject({
      ok: true,
      data: { volume: "25.5", isActive: false },
    });
  });

  it("marca cada campo inválido y devuelve lo cargado", () => {
    const result = validateProductForm(
      form({
        ...valid,
        name: "",
        sku: "con espacios",
        barcode: "123",
        categoryId: "",
        price: "1.250,00",
        weight: "0",
        volume: "-1",
      }),
      t,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.state.errors).toMatchObject({
      name: [t.nameRequired],
      sku: [t.skuFormat],
      barcode: [t.barcodeFormat],
      categoryId: [t.categoryRequired],
      price: [t.priceInvalid],
      weight: [t.weightInvalid],
      volume: [t.volumeInvalid],
    });
    expect(result.state.values?.sku).toBe("con espacios");
  });
});

describe("isProductId", () => {
  it("descarta lo que no puede ser un CUID2", () => {
    expect(isProductId("x6x0uzz02a26bhdgg5kk343s")).toBe(true);
    expect(isProductId("../etc")).toBe(false);
    expect(isProductId(7)).toBe(false);
  });
});
