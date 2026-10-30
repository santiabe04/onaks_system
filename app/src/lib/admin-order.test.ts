import { describe, expect, it } from "vitest";
import { es } from "@/i18n/dictionaries/es";
import {
  parseAdminOrder,
  saleItemSnapshot,
  searchKey,
  searchProducts,
} from "./admin-order";

const t = es.adminOrderNew.errors;
const DOG_FOOD = "dogfood15kg";
const CAT_LOOSE = "catfoodloose";

function form(entries: [string, string][]) {
  const data = new FormData();
  for (const [key, value] of entries) data.append(key, value);
  return data;
}

const products = [
  { id: DOG_FOOD, allowsDecimals: false },
  { id: CAT_LOOSE, allowsDecimals: true },
];

describe("searchProducts", () => {
  const catalog = [
    { name: "Alimento perro adulto 15 kg", sku: "PER-AD-15", barcode: null },
    { name: "Alimento gato suelto", sku: "GAT-SUELTO", barcode: "7790001" },
    { name: "Piedras sanitarias 4 kg", sku: "PIE-4", barcode: null },
  ];

  it("busca por todas las palabras en nombre, SKU o código de barras", () => {
    expect(searchProducts(catalog, "alimento gato")).toEqual([catalog[1]]);
    expect(searchProducts(catalog, "pie-4")).toEqual([catalog[2]]);
    expect(searchProducts(catalog, "7790001")).toEqual([catalog[1]]);
  });

  it("sin texto no muestra nada y respeta el límite", () => {
    expect(searchProducts(catalog, "  ")).toEqual([]);
    expect(searchProducts(catalog, "kg", 1)).toEqual([catalog[0]]);
  });

  it("ignora mayúsculas y acentos", () => {
    expect(searchKey("  Alimentación ÑANDÚ ")).toBe("alimentacion nandu");
  });
});

describe("parseAdminOrder", () => {
  const base: [string, string][] = [
    ["customerId", "custpetshop"],
    ["addressId", "addrquilmes"],
    ["notes", " Llamar antes "],
  ];

  it("lee cliente, dirección, comentario y líneas", () => {
    expect(
      parseAdminOrder(
        form([...base, [`qty_${DOG_FOOD}`, "3"], [`qty_${CAT_LOOSE}`, "2,5"]]),
        products,
        t,
      ),
    ).toEqual({
      ok: true,
      data: {
        customerId: "custpetshop",
        addressId: "addrquilmes",
        notes: "Llamar antes",
        lines: [
          { productId: DOG_FOOD, quantity: "3" },
          { productId: CAT_LOOSE, quantity: "2.5" },
        ],
      },
    });
  });

  it("exige cliente, dirección y al menos un producto", () => {
    expect(parseAdminOrder(form([]), products, t)).toEqual({
      ok: false,
      error: t.customer,
    });
    expect(
      parseAdminOrder(form([["customerId", "custpetshop"]]), products, t),
    ).toEqual({ ok: false, error: t.address });
    expect(parseAdminOrder(form(base), products, t)).toEqual({
      ok: false,
      error: t.noLines,
    });
  });

  it("rechaza cantidades inválidas y productos que no se venden", () => {
    expect(
      parseAdminOrder(form([...base, [`qty_${DOG_FOOD}`, "1,5"]]), products, t),
    ).toEqual({ ok: false, error: t.quantity });
    expect(
      parseAdminOrder(form([...base, [`qty_${DOG_FOOD}`, "0"]]), products, t),
    ).toEqual({ ok: false, error: t.quantity });
    expect(
      parseAdminOrder(
        form([...base, ["qty_productopausado", "1"]]),
        products,
        t,
      ),
    ).toEqual({ ok: false, error: t.unavailable });
  });
});

describe("saleItemSnapshot", () => {
  it("copia precio, peso, volumen y alícuota del momento", () => {
    expect(
      saleItemSnapshot(
        {
          id: DOG_FOOD,
          price: "26000",
          weight: "15",
          volume: null,
          taxRate: { rate: "0.105" },
        },
        "3",
      ),
    ).toEqual({
      productId: DOG_FOOD,
      quantity: "3",
      unitPrice: "26000",
      unitWeight: "15",
      unitVolume: null,
      unitTaxRate: "0.105",
    });
  });
});
