import { PaymentMethod } from "@/generated/prisma/enums";
import { interpolate } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/es";
import { parseDecimalInput } from "./decimal-input";

// Puro: lo que se carga en una parada (entregado / no entregado).

export const STOP_LIMITS = {
  receiverName: 80,
  receiverDni: 15,
  reason: 200,
} as const;

const MONEY_LIMITS = { maxDecimals: 2, maxIntegerDigits: 10 };

type Messages = Dictionary["delivery"]["errors"];

export type StopRecordInput =
  | {
      outcome: "DELIVERED";
      receiverName: string | null;
      receiverDni: string | null;
      /** Firma dibujada ("data:image/png;base64,…") o null si se usó foto. */
      signature: string | null;
      /** Cobro en el momento (va a la cuenta corriente), o null. */
      payment: { amount: string; method: PaymentMethod } | null;
      location: StopLocation | null;
    }
  | {
      outcome: "NOT_DELIVERED";
      reason: string;
      location: StopLocation | null;
    };

export type StopLocation = {
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
};

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

/** La ubicación es opcional: si el celular no la da (o la niegan), se omite. */
function readLocation(formData: FormData): StopLocation | null {
  const latitude = Number(text(formData, "latitude"));
  const longitude = Number(text(formData, "longitude"));
  if (
    !text(formData, "latitude") ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  ) {
    return null;
  }
  const accuracy = Number(text(formData, "accuracy"));
  return {
    // La columna guarda 6 decimales (~10 cm): más no tiene sentido.
    latitude: Math.round(latitude * 1e6) / 1e6,
    longitude: Math.round(longitude * 1e6) / 1e6,
    accuracyMeters:
      Number.isFinite(accuracy) && accuracy >= 0 ? Math.round(accuracy) : null,
  };
}

/**
 * `hasPhoto`: si vino una foto del remito (el archivo se procesa aparte).
 * Entregado lleva firma con aclaración o foto; no entregado, el motivo.
 */
export function validateStopRecord(
  formData: FormData,
  hasPhoto: boolean,
  t: Messages,
): { ok: true; data: StopRecordInput } | { ok: false; error: string } {
  const location = readLocation(formData);
  const outcome = text(formData, "outcome");

  if (outcome === "NOT_DELIVERED") {
    const reason = text(formData, "reason");
    if (!reason) return { ok: false, error: t.reasonRequired };
    if (reason.length > STOP_LIMITS.reason) {
      return {
        ok: false,
        error: interpolate(t.tooLong, { max: STOP_LIMITS.reason }),
      };
    }
    return { ok: true, data: { outcome, reason, location } };
  }
  if (outcome !== "DELIVERED") return { ok: false, error: t.outcomeRequired };

  const signature = text(formData, "signature") || null;
  const receiverName = text(formData, "receiverName") || null;
  const receiverDni = text(formData, "receiverDni") || null;
  if (!signature && !hasPhoto) return { ok: false, error: t.proofRequired };
  if (signature && !receiverName) return { ok: false, error: t.nameRequired };
  if ((receiverName?.length ?? 0) > STOP_LIMITS.receiverName) {
    return {
      ok: false,
      error: interpolate(t.tooLong, { max: STOP_LIMITS.receiverName }),
    };
  }
  if ((receiverDni?.length ?? 0) > STOP_LIMITS.receiverDni) {
    return {
      ok: false,
      error: interpolate(t.tooLong, { max: STOP_LIMITS.receiverDni }),
    };
  }

  let payment: { amount: string; method: PaymentMethod } | null = null;
  const rawAmount = text(formData, "amount");
  if (rawAmount) {
    const amount = parseDecimalInput(rawAmount, MONEY_LIMITS);
    if (amount === null || Number(amount) <= 0) {
      return { ok: false, error: t.amount };
    }
    const method = text(formData, "method");
    if (!(Object.values(PaymentMethod) as string[]).includes(method)) {
      return { ok: false, error: t.method };
    }
    payment = { amount, method: method as PaymentMethod };
  }

  return {
    ok: true,
    data: {
      outcome,
      receiverName,
      receiverDni,
      signature,
      payment,
      location,
    },
  };
}
