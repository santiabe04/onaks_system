import { describe, expect, it } from "vitest";
import { es } from "@/i18n/dictionaries/es";
import { summarizeCollections, validateClosingForm } from "./route-closing";

const t = es.routes.closing.errors;

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

describe("summarizeCollections", () => {
  it("suma lo cobrado por forma de pago, sin anulados, y cuenta las pendientes", () => {
    expect(
      summarizeCollections([
        {
          status: "DELIVERED",
          payment: { amount: "29860", method: "CASH", voidedAt: null },
        },
        {
          status: "DELIVERED",
          payment: { amount: "15000.50", method: "CASH", voidedAt: null },
        },
        {
          status: "DELIVERED",
          payment: { amount: "27625", method: "TRANSFER", voidedAt: null },
        },
        {
          status: "DELIVERED",
          payment: { amount: "5000", method: "CASH", voidedAt: new Date() },
        },
        { status: "NOT_DELIVERED", payment: null },
        { status: "PENDING", payment: null },
      ]),
    ).toEqual({
      byMethod: { CASH: "44860.50", TRANSFER: "27625.00" },
      cashExpected: "44860.50",
      pendingStops: 1,
    });
  });

  it("sin cobros en efectivo, se espera 0", () => {
    expect(summarizeCollections([]).cashExpected).toBe("0.00");
  });
});

describe("validateClosingForm", () => {
  it("si coincide no pide comentario", () => {
    expect(
      validateClosingForm(form({ cashReceived: "44860,50" }), "44860.50", t),
    ).toEqual({
      ok: true,
      data: { cashReceived: "44860.50", difference: "0.00", notes: null },
    });
  });

  it("con diferencia exige el comentario y la calcula con signo", () => {
    expect(
      validateClosingForm(form({ cashReceived: "44000" }), "44860.50", t),
    ).toEqual({ ok: false, error: t.differenceNotes });
    expect(
      validateClosingForm(
        form({ cashReceived: "44000", notes: "Dio vuelto de más" }),
        "44860.50",
        t,
      ),
    ).toEqual({
      ok: true,
      data: {
        cashReceived: "44000.00",
        difference: "-860.50",
        notes: "Dio vuelto de más",
      },
    });
  });

  it("valida el monto recibido", () => {
    expect(validateClosingForm(form({ cashReceived: "" }), "0", t)).toEqual({
      ok: false,
      error: t.cashReceived,
    });
  });
});
