import { describe, expect, it } from "vitest";
import { es } from "@/i18n/dictionaries/es";
import {
  orderStateFor,
  parseReason,
  parseReceiptHeader,
  parseReceiptLines,
  pendingQuantity,
  receiptDifference,
} from "./goods-receipt";

const t = es.receipts.errors;
const DOG_FOOD = "dogfood15kg";
const CAT_LITTER = "catlitter10kg";
const BULK_SEED = "birdseedbulk";

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

const products = [
  { productId: DOG_FOOD, allowsDecimals: false },
  { productId: CAT_LITTER, allowsDecimals: false },
  { productId: BULK_SEED, allowsDecimals: true },
];

describe("pendingQuantity", () => {
  it("es lo pedido menos lo recibido, sin bajar de 0", () => {
    expect(pendingQuantity({ quantity: "20", receivedQuantity: "12" })).toBe(
      "8",
    );
    expect(pendingQuantity({ quantity: "20", receivedQuantity: "22" })).toBe(
      "0",
    );
  });
});

describe("receiptDifference", () => {
  it("positiva si llegó de más, negativa si faltó", () => {
    expect(receiptDifference("10", "12")).toBe("2");
    expect(receiptDifference("10", "7.5")).toBe("-2.5");
    expect(receiptDifference("10", "10")).toBe("0");
  });
});

describe("orderStateFor", () => {
  it("sin nada recibido vuelve a Enviada", () => {
    expect(
      orderStateFor([
        { quantity: "10", receivedQuantity: "0" },
        { quantity: "5", receivedQuantity: "0" },
      ]),
    ).toBe("SENT");
  });

  it("con alguna línea incompleta es Recibida parcial", () => {
    expect(
      orderStateFor([
        { quantity: "10", receivedQuantity: "10" },
        { quantity: "5", receivedQuantity: "0" },
      ]),
    ).toBe("PARTIALLY_RECEIVED");
  });

  it("todo recibido (o de más) es Recibida", () => {
    expect(
      orderStateFor([
        { quantity: "10", receivedQuantity: "12" },
        { quantity: "5", receivedQuantity: "5" },
      ]),
    ).toBe("RECEIVED");
  });
});

describe("parseReceiptLines", () => {
  it("toma lo que llegó y saltea lo vacío o en 0", () => {
    expect(
      parseReceiptLines(
        form({
          [`rcv_${DOG_FOOD}`]: "12",
          [`rcv_${CAT_LITTER}`]: "0",
          [`rcv_${BULK_SEED}`]: "2,500",
        }),
        products,
        t,
      ),
    ).toEqual({
      ok: true,
      lines: [
        { productId: DOG_FOOD, quantity: "12" },
        { productId: BULK_SEED, quantity: "2.5" },
      ],
    });
  });

  it("pide lote y vencimiento de lo que llegó de un producto que controla vencimiento", () => {
    const tracked = [
      { productId: DOG_FOOD, allowsDecimals: false, tracksExpiry: true },
    ];
    const base = { [`rcv_${DOG_FOOD}`]: "12" };
    expect(
      parseReceiptLines(
        form({
          ...base,
          [`lot_${DOG_FOOD}_0`]: " l-2301 ",
          [`exp_${DOG_FOOD}_0`]: "2027-03-31",
        }),
        tracked,
        t,
      ),
    ).toEqual({
      ok: true,
      lines: [
        {
          productId: DOG_FOOD,
          quantity: "12",
          lots: [{ code: "L-2301", expiresOn: "2027-03-31", quantity: "12" }],
        },
      ],
    });
    expect(parseReceiptLines(form(base), tracked, t)).toEqual({
      ok: false,
      error: t.lotRequired,
    });
    expect(
      parseReceiptLines(
        form({
          ...base,
          [`lot_${DOG_FOOD}_0`]: "L1",
          [`exp_${DOG_FOOD}_0`]: "2027-02-30",
        }),
        tracked,
        t,
      ),
    ).toEqual({ ok: false, error: t.expiryInvalid });
  });

  it("reparte lo que llegó en varios lotes que tienen que sumar el total", () => {
    const tracked = [
      { productId: DOG_FOOD, allowsDecimals: false, tracksExpiry: true },
    ];
    const row = (n: number, lot: string, exp: string, qty: string) => ({
      [`lot_${DOG_FOOD}_${n}`]: lot,
      [`exp_${DOG_FOOD}_${n}`]: exp,
      [`lq_${DOG_FOOD}_${n}`]: qty,
    });
    const base = { [`rcv_${DOG_FOOD}`]: "10" };
    expect(
      parseReceiptLines(
        form({
          ...base,
          ...row(0, "a1", "2027-01-10", "4"),
          ...row(1, "b2", "2027-05-20", "6"),
        }),
        tracked,
        t,
      ),
    ).toEqual({
      ok: true,
      lines: [
        {
          productId: DOG_FOOD,
          quantity: "10",
          lots: [
            { code: "A1", expiresOn: "2027-01-10", quantity: "4" },
            { code: "B2", expiresOn: "2027-05-20", quantity: "6" },
          ],
        },
      ],
    });
    // No suman, una fila sin cantidad entre varias, o un lote repetido.
    for (const fields of [
      {
        ...row(0, "a1", "2027-01-10", "4"),
        ...row(1, "b2", "2027-05-20", "5"),
      },
      { ...row(0, "a1", "2027-01-10", ""), ...row(1, "b2", "2027-05-20", "6") },
      {
        ...row(0, "a1", "2027-01-10", "4"),
        ...row(1, "a1", "2027-01-10", "6"),
      },
    ]) {
      expect(
        parseReceiptLines(form({ ...base, ...fields }), tracked, t).ok,
      ).toBe(false);
    }
  });

  it("no pide lote de lo que no llegó ni de productos sin vencimiento", () => {
    const mixed = [
      { productId: DOG_FOOD, allowsDecimals: false, tracksExpiry: true },
      { productId: CAT_LITTER, allowsDecimals: false },
    ];
    expect(
      parseReceiptLines(
        form({ [`rcv_${DOG_FOOD}`]: "0", [`rcv_${CAT_LITTER}`]: "4" }),
        mixed,
        t,
      ),
    ).toEqual({ ok: true, lines: [{ productId: CAT_LITTER, quantity: "4" }] });
  });

  it("ignora productos que no son de la orden", () => {
    const result = parseReceiptLines(
      form({ [`rcv_${DOG_FOOD}`]: "3", rcv_otherproduct: "9" }),
      products,
      t,
    );
    expect(result).toEqual({
      ok: true,
      lines: [{ productId: DOG_FOOD, quantity: "3" }],
    });
  });

  it("rechaza decimales en unidades enteras y texto inválido", () => {
    expect(
      parseReceiptLines(form({ [`rcv_${DOG_FOOD}`]: "1,5" }), products, t),
    ).toEqual({ ok: false, error: t.quantity });
    expect(
      parseReceiptLines(form({ [`rcv_${BULK_SEED}`]: "-2" }), products, t),
    ).toEqual({ ok: false, error: t.quantity });
  });

  it("exige al menos un producto recibido", () => {
    expect(parseReceiptLines(form({}), products, t)).toEqual({
      ok: false,
      error: t.noLines,
    });
  });
});

describe("parseReceiptHeader", () => {
  it("lee depósito, remito y comentario", () => {
    expect(
      parseReceiptHeader(
        form({
          warehouseId: "warehousesouth",
          deliveryNote: " R-0001-00012345 ",
          notes: "",
        }),
        t,
      ),
    ).toEqual({
      ok: true,
      data: {
        warehouseId: "warehousesouth",
        deliveryNote: "R-0001-00012345",
        notes: null,
      },
    });
  });

  it("exige el depósito y limita el remito", () => {
    expect(parseReceiptHeader(form({}), t)).toEqual({
      ok: false,
      error: t.warehouse,
    });
    const result = parseReceiptHeader(
      form({ warehouseId: "warehousesouth", deliveryNote: "x".repeat(51) }),
      t,
    );
    expect(result.ok).toBe(false);
  });
});

describe("parseReason", () => {
  it("exige un motivo", () => {
    expect(parseReason(form({ reason: "  " }), t)).toEqual({
      ok: false,
      error: t.reasonRequired,
    });
    expect(
      parseReason(form({ reason: "Cargado en el depósito equivocado" }), t),
    ).toEqual({ ok: true, reason: "Cargado en el depósito equivocado" });
  });
});
