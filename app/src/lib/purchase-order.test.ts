import { describe, expect, it } from "vitest";
import { es } from "@/i18n/dictionaries/es";
import {
  parsePurchaseHeader,
  parsePurchaseLines,
  purchaseOrderText,
  suggestQuantity,
} from "./purchase-order";

const t = es.purchases.errors;

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

describe("suggestQuantity", () => {
  it("cubre el mínimo y lo reservado, descontando stock y lo ya pedido", () => {
    // Mínimo 10 bolsas, 4 reservadas, 3 en stock, 5 en otra OC: faltan 6.
    expect(
      suggestQuantity({
        minStock: "10",
        stock: "3",
        reserved: "4",
        onOrder: "5",
        allowsDecimals: false,
      }),
    ).toBe("6");
  });

  it("redondea para arriba las unidades enteras y respeta los decimales", () => {
    const base = { minStock: "2.4", stock: "0", reserved: "0", onOrder: "0" };
    expect(suggestQuantity({ ...base, allowsDecimals: false })).toBe("3");
    expect(suggestQuantity({ ...base, allowsDecimals: true })).toBe("2.4");
  });

  it("sin faltante sugiere 0, también con stock negativo cubierto", () => {
    expect(
      suggestQuantity({
        minStock: null,
        stock: "8",
        reserved: "2",
        onOrder: "0",
        allowsDecimals: false,
      }),
    ).toBe("0");
    expect(
      suggestQuantity({
        minStock: null,
        stock: "-2",
        reserved: "0",
        onOrder: "0",
        allowsDecimals: false,
      }),
    ).toBe("2");
  });
});

describe("parsePurchaseLines", () => {
  const products = [
    { productId: "prodbolsa15", allowsDecimals: false },
    { productId: "prodsuelto", allowsDecimals: true },
    { productId: "prodpausado", allowsDecimals: false },
  ];

  it("toma solo los productos con cantidad, con coma decimal", () => {
    expect(
      parsePurchaseLines(
        form({
          qty_prodbolsa15: "12",
          cost_prodbolsa15: "18500,50",
          qty_prodsuelto: "25,5",
          cost_prodsuelto: "2900",
          qty_prodpausado: "0",
        }),
        products,
        t,
      ),
    ).toEqual({
      ok: true,
      lines: [
        { productId: "prodbolsa15", quantity: "12", unitCost: "18500.50" },
        { productId: "prodsuelto", quantity: "25.5", unitCost: "2900" },
      ],
    });
  });

  it("valida cantidades enteras y exige el costo", () => {
    expect(
      parsePurchaseLines(form({ qty_prodbolsa15: "1,5" }), products, t),
    ).toEqual({ ok: false, error: t.quantity });
    expect(
      parsePurchaseLines(form({ qty_prodbolsa15: "2" }), products, t),
    ).toEqual({ ok: false, error: t.cost });
  });
});

describe("parsePurchaseHeader", () => {
  it("fecha esperada y comentario opcionales", () => {
    expect(
      parsePurchaseHeader(form({ expectedDate: "", notes: " " }), t),
    ).toEqual({ ok: true, data: { expectedDate: null, notes: null } });
    expect(parsePurchaseHeader(form({ expectedDate: "mañana" }), t)).toEqual({
      ok: false,
      error: t.expectedDate,
    });
  });
});

describe("purchaseOrderText", () => {
  it("arma el mensaje con códigos del proveedor y la fecha esperada", () => {
    expect(
      purchaseOrderText(
        {
          number: 7,
          supplierName: "Alimentos del Sur",
          expectedDate: new Date("2026-11-03T00:00:00Z"),
          notes: "Entregar por la mañana",
          items: [
            {
              name: "Alimento perro adulto 15 kg",
              supplierCode: "AP-15",
              quantity: "12",
              unit: "u",
            },
            {
              name: "Alimento gato suelto",
              supplierCode: null,
              quantity: "25,5",
              unit: "kg",
            },
          ],
        },
        es.purchases.whatsapp,
        (day) => day.split("-").reverse().join("/"),
      ),
    ).toBe(
      [
        "Hola Alimentos del Sur, les pasamos la orden de compra:",
        "OC #7",
        "",
        "• 12 u — Alimento perro adulto 15 kg (AP-15)",
        "• 25,5 kg — Alimento gato suelto",
        "",
        "Entrega esperada: 03/11/2026",
        "",
        "Entregar por la mañana",
        "",
        "¡Gracias!",
      ].join("\n"),
    );
  });
});
