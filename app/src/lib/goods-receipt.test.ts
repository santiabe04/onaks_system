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
