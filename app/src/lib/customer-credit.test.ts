import { describe, expect, it } from "vitest";
import { es } from "@/i18n/dictionaries/es";
import {
  isReturnable,
  parseAdjustment,
  parseReturn,
  remainingQuantity,
  returnAmount,
  type ReturnableLine,
} from "./customer-credit";

const t = es.customerCreditNotes.errors;
const DOG_FOOD = "dogfood15kg";
const CAT_LOOSE = "catfoodloose";

// Pedido entregado: 4 bolsas de alimento de perro (ya se devolvió 1) y 2,5 kg
// de alimento de gato suelto.
const lines: ReturnableLine[] = [
  {
    productId: DOG_FOOD,
    quantity: "4",
    returned: "1",
    unitPrice: "23400",
    unitTaxRate: "0.105",
    allowsDecimals: false,
  },
  {
    productId: CAT_LOOSE,
    quantity: "2.5",
    returned: "0",
    unitPrice: "3333.33",
    unitTaxRate: "0.21",
    allowsDecimals: true,
  },
];

function form(entries: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.set(key, value);
  return data;
}

describe("isReturnable", () => {
  it("solo se devuelve de pedidos entregados", () => {
    expect(isReturnable("DELIVERED")).toBe(true);
    expect(isReturnable("FINISHED")).toBe(true);
    expect(isReturnable("PENDING")).toBe(false);
    expect(isReturnable("OUT_FOR_DELIVERY")).toBe(false);
    expect(isReturnable("CANCELED")).toBe(false);
  });
});

describe("remainingQuantity", () => {
  it("es lo entregado menos lo ya devuelto, con decimales", () => {
    expect(remainingQuantity(lines[0])).toBe("3");
    expect(remainingQuantity({ quantity: "2.5", returned: "0.75" })).toBe(
      "1.75",
    );
  });

  it("nunca es negativo", () => {
    expect(remainingQuantity({ quantity: "2", returned: "3" })).toBe("0");
  });
});

describe("returnAmount", () => {
  it("acredita lo que pagó el cliente: precio y alícuota del pedido, con IVA", () => {
    // 2 × 23.400 = 46.800 + 10,5 % (4.914) = 51.714,00
    expect(
      returnAmount([
        { quantity: "2", unitPrice: "23400", unitTaxRate: "0.105" },
      ]),
    ).toBe("51714.00");
  });

  it("suma las líneas ya redondeadas a centavos", () => {
    // 23.400 + 10,5 % = 25.857,00; 2,5 × 3333,33 = 8333,325 → 8333,33 + IVA 21 % (1750,00) = 10083,33.
    expect(
      returnAmount([
        { quantity: "1", unitPrice: "23400", unitTaxRate: "0.105" },
        { quantity: "2.5", unitPrice: "3333.33", unitTaxRate: "0.21" },
      ]),
    ).toBe("35940.33");
  });
});

describe("parseReturn", () => {
  it("lee las cantidades, el destino y el motivo; saltea lo que queda en 0 o vacío", () => {
    expect(
      parseReturn(
        form({
          warehouse: "sur",
          reason: " Producto vencido ",
          [`qty_${DOG_FOOD}`]: "2",
          [`dest_${DOG_FOOD}`]: "WRITE_OFF",
          [`qty_${CAT_LOOSE}`]: "0",
          [`dest_${CAT_LOOSE}`]: "RESTOCK",
        }),
        lines,
        t,
      ),
    ).toEqual({
      ok: true,
      data: {
        warehouseId: "sur",
        reason: "Producto vencido",
        lines: [
          { productId: DOG_FOOD, quantity: "2", destination: "WRITE_OFF" },
        ],
      },
    });
  });

  it("acepta fracciones solo en unidades que las admiten", () => {
    const ok = parseReturn(
      form({
        warehouse: "sur",
        reason: "Error",
        [`qty_${CAT_LOOSE}`]: "1,5",
        [`dest_${CAT_LOOSE}`]: "RESTOCK",
      }),
      lines,
      t,
    );
    expect(ok).toMatchObject({
      ok: true,
      data: { lines: [{ productId: CAT_LOOSE, quantity: "1.5" }] },
    });
    expect(
      parseReturn(
        form({
          warehouse: "sur",
          reason: "Error",
          [`qty_${DOG_FOOD}`]: "1,5",
          [`dest_${DOG_FOOD}`]: "RESTOCK",
        }),
        lines,
        t,
      ),
    ).toEqual({ ok: false, error: t.quantity });
  });

  it("no deja devolver más de lo que queda (descontado lo ya devuelto)", () => {
    const base = {
      warehouse: "sur",
      reason: "Error",
      [`dest_${DOG_FOOD}`]: "RESTOCK",
    };
    expect(
      parseReturn(form({ ...base, [`qty_${DOG_FOOD}`]: "3" }), lines, t).ok,
    ).toBe(true);
    expect(
      parseReturn(form({ ...base, [`qty_${DOG_FOOD}`]: "4" }), lines, t),
    ).toEqual({ ok: false, error: t.quantity });
  });

  it("pide depósito, motivo, al menos una línea y un destino válido", () => {
    const line = {
      [`qty_${DOG_FOOD}`]: "1",
      [`dest_${DOG_FOOD}`]: "RESTOCK",
    };
    expect(parseReturn(form({ reason: "x", ...line }), lines, t)).toEqual({
      ok: false,
      error: t.warehouse,
    });
    expect(parseReturn(form({ warehouse: "sur", ...line }), lines, t)).toEqual({
      ok: false,
      error: t.reasonRequired,
    });
    expect(
      parseReturn(form({ warehouse: "sur", reason: "x" }), lines, t),
    ).toEqual({ ok: false, error: t.noLines });
    expect(
      parseReturn(
        form({
          warehouse: "sur",
          reason: "x",
          [`qty_${DOG_FOOD}`]: "1",
          [`dest_${DOG_FOOD}`]: "TIRAR",
        }),
        lines,
        t,
      ),
    ).toEqual({ ok: false, error: t.destination });
  });

  it("limita el largo del motivo", () => {
    expect(
      parseReturn(
        form({
          warehouse: "sur",
          reason: "x".repeat(301),
          [`qty_${DOG_FOOD}`]: "1",
          [`dest_${DOG_FOOD}`]: "RESTOCK",
        }),
        lines,
        t,
      ),
    ).toEqual({ ok: false, error: t.reasonTooLong });
  });
});

describe("parseAdjustment", () => {
  it("toma el importe con coma o punto y el motivo", () => {
    expect(
      parseAdjustment(form({ amount: "1500,5", reason: " Bonificación " }), t),
    ).toEqual({ ok: true, data: { amount: "1500.5", reason: "Bonificación" } });
  });

  it("rechaza importes en cero, negativos o con más de 2 decimales", () => {
    for (const amount of ["0", "-10", "10,555", "", "abc"]) {
      expect(parseAdjustment(form({ amount, reason: "x" }), t)).toEqual({
        ok: false,
        error: t.amount,
      });
    }
  });

  it("pide el motivo", () => {
    expect(parseAdjustment(form({ amount: "10", reason: " " }), t)).toEqual({
      ok: false,
      error: t.reasonRequired,
    });
  });
});
