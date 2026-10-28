import { describe, expect, it } from "vitest";
import { es } from "@/i18n/dictionaries/es";
import { validateStopRecord } from "./stop-record";

const t = es.delivery.errors;
const SIGNATURE = "data:image/png;base64,iVBORw0KGgo=";

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

describe("validateStopRecord", () => {
  it("entregado con firma, aclaración, cobro en efectivo y ubicación", () => {
    expect(
      validateStopRecord(
        form({
          outcome: "DELIVERED",
          signature: SIGNATURE,
          receiverName: " Laura Gómez ",
          receiverDni: "30123456",
          amount: "29860,50",
          method: "CASH",
          latitude: "-34.6612345678",
          longitude: "-58.3654321",
          accuracy: "12.4",
        }),
        false,
        t,
      ),
    ).toEqual({
      ok: true,
      data: {
        outcome: "DELIVERED",
        receiverName: "Laura Gómez",
        receiverDni: "30123456",
        signature: SIGNATURE,
        payment: { amount: "29860.50", method: "CASH" },
        location: {
          latitude: -34.661235,
          longitude: -58.365432,
          accuracyMeters: 12,
        },
      },
    });
  });

  it("con foto del remito no hace falta firma ni aclaración, y el cobro es opcional", () => {
    expect(
      validateStopRecord(form({ outcome: "DELIVERED" }), true, t),
    ).toMatchObject({
      ok: true,
      data: { signature: null, payment: null, location: null },
    });
  });

  it("entregado sin firma ni foto, o firma sin aclaración, no pasa", () => {
    expect(
      validateStopRecord(form({ outcome: "DELIVERED" }), false, t),
    ).toEqual({ ok: false, error: t.proofRequired });
    expect(
      validateStopRecord(
        form({ outcome: "DELIVERED", signature: SIGNATURE }),
        false,
        t,
      ),
    ).toEqual({ ok: false, error: t.nameRequired });
  });

  it("valida monto y forma de pago si hay cobro", () => {
    expect(
      validateStopRecord(
        form({ outcome: "DELIVERED", amount: "0", method: "CASH" }),
        true,
        t,
      ),
    ).toEqual({ ok: false, error: t.amount });
    expect(
      validateStopRecord(
        form({ outcome: "DELIVERED", amount: "100", method: "BITCOIN" }),
        true,
        t,
      ),
    ).toEqual({ ok: false, error: t.method });
  });

  it("no entregado exige el motivo", () => {
    expect(
      validateStopRecord(form({ outcome: "NOT_DELIVERED" }), false, t),
    ).toEqual({ ok: false, error: t.reasonRequired });
    expect(
      validateStopRecord(
        form({ outcome: "NOT_DELIVERED", reason: "Cerrado", latitude: "x" }),
        false,
        t,
      ),
    ).toEqual({
      ok: true,
      data: { outcome: "NOT_DELIVERED", reason: "Cerrado", location: null },
    });
  });
});
