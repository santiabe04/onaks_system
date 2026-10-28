import { describe, expect, it } from "vitest";
import { es } from "@/i18n/dictionaries/es";
import { deliveredQuantities, parsePartialDelivery } from "./partial-delivery";

const t = es.delivery.errors;

// Pedido de un pet shop: 2 bolsas de alimento y 1,25 kg de alimento suelto.
const items = [
  { productId: "prodbolsa15", quantity: "2.0000", allowsDecimals: false },
  { productId: "prodsuelto", quantity: "1.2500", allowsDecimals: true },
];

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

describe("parsePartialDelivery", () => {
  it("sin marcar entrega parcial no hay faltantes", () => {
    expect(parsePartialDelivery(form({}), items, t)).toEqual({
      ok: true,
      shortages: [],
    });
  });

  it("registra lo que faltó y el motivo de cada producto", () => {
    expect(
      parsePartialDelivery(
        form({
          partial: "on",
          delivered_prodbolsa15: "1",
          reason_prodbolsa15: "WRITTEN_OFF",
          delivered_prodsuelto: "0,75",
          reason_prodsuelto: "RETURNED",
        }),
        items,
        t,
      ),
    ).toEqual({
      ok: true,
      shortages: [
        {
          productId: "prodbolsa15",
          ordered: "2",
          delivered: "1",
          missing: "1",
          reason: "WRITTEN_OFF",
        },
        {
          productId: "prodsuelto",
          ordered: "1.25",
          delivered: "0.75",
          missing: "0.5",
          reason: "RETURNED",
        },
      ],
    });
  });

  it("si se entregó todo, aunque esté marcada, no hay faltantes", () => {
    expect(
      parsePartialDelivery(
        form({
          partial: "on",
          delivered_prodbolsa15: "2",
          delivered_prodsuelto: "1,25",
        }),
        items,
        t,
      ),
    ).toEqual({ ok: true, shortages: [] });
  });

  it("valida cantidades, motivo y que se haya entregado algo", () => {
    const run = (fields: Record<string, string>) =>
      parsePartialDelivery(form({ partial: "on", ...fields }), items, t);
    expect(
      run({ delivered_prodbolsa15: "1,5", delivered_prodsuelto: "1,25" }),
    ).toEqual({ ok: false, error: t.deliveredQuantity });
    expect(
      run({ delivered_prodbolsa15: "3", delivered_prodsuelto: "1,25" }),
    ).toEqual({ ok: false, error: t.deliveredTooMuch });
    expect(
      run({ delivered_prodbolsa15: "1", delivered_prodsuelto: "1,25" }),
    ).toEqual({ ok: false, error: t.shortageReason });
    expect(
      run({
        delivered_prodbolsa15: "0",
        reason_prodbolsa15: "RETURNED",
        delivered_prodsuelto: "0",
        reason_prodsuelto: "RETURNED",
      }),
    ).toEqual({ ok: false, error: t.nothingDelivered });
  });
});

describe("deliveredQuantities", () => {
  it("deja lo entregado y el resto como estaba", () => {
    expect(
      deliveredQuantities(items, [
        {
          productId: "prodsuelto",
          ordered: "1.25",
          delivered: "0",
          missing: "1.25",
          reason: "RETURNED",
        },
      ]),
    ).toEqual([
      { productId: "prodbolsa15", quantity: "2" },
      { productId: "prodsuelto", quantity: "0" },
    ]);
  });
});
