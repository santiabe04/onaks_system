import { describe, expect, it } from "vitest";
import { es } from "@/i18n/dictionaries/es";
import { validatePaymentForm, validateVoidReason } from "./payment-form";

const t = es.account.errors;
const TODAY = "2026-10-28";

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

describe("validatePaymentForm", () => {
  it("acepta un cobro en efectivo con coma decimal", () => {
    expect(
      validatePaymentForm(
        form({
          kind: "PAYMENT",
          amount: "30000,50",
          method: "CASH",
          paidOn: TODAY,
          notes: " Pagó al recibir el pedido ",
        }),
        t,
        TODAY,
      ),
    ).toMatchObject({
      ok: true,
      data: {
        kind: "PAYMENT",
        amount: "30000.50",
        method: "CASH",
        paidOn: TODAY,
        notes: "Pagó al recibir el pedido",
      },
    });
  });

  it("exige monto positivo, forma de pago y fecha no futura", () => {
    const result = validatePaymentForm(
      form({ amount: "0", method: "BITCOIN", paidOn: "2026-10-29" }),
      t,
      TODAY,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.state.errors).toMatchObject({
      amount: [t.amount],
      method: [t.method],
      paidOn: [t.futureDate],
    });
    expect(result.state.values?.amount).toBe("0");
  });

  it("rechaza más de 2 decimales", () => {
    const result = validatePaymentForm(
      form({ amount: "10,555", method: "CASH", paidOn: TODAY }),
      t,
      TODAY,
    );
    expect(result.ok).toBe(false);
  });
});

describe("validateVoidReason", () => {
  it("el motivo es obligatorio", () => {
    expect(validateVoidReason(form({ reason: "  " }), t)).toEqual({
      ok: false,
      error: t.reasonRequired,
    });
    expect(
      validateVoidReason(form({ reason: "Cargado dos veces" }), t),
    ).toEqual({ ok: true, reason: "Cargado dos veces" });
  });
});
