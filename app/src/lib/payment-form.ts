import { CustomerPaymentKind, PaymentMethod } from "@/generated/prisma/enums";
import { interpolate } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/es";
import { parseDecimalInput } from "./decimal-input";
import { isoDay } from "./order-period";

// Puro: los formularios de cobro / reintegro y de anulación.

export const PAYMENT_NOTES_MAX_LENGTH = 200;
const MONEY_LIMITS = { maxDecimals: 2, maxIntegerDigits: 10 };

type Messages = Dictionary["account"]["errors"];

export type PaymentValues = {
  kind: string;
  amount: string;
  method: string;
  paidOn: string;
  notes: string;
};

export type PaymentInput = {
  kind: CustomerPaymentKind;
  /** "1234.5" (sin separador de miles). */
  amount: string;
  method: PaymentMethod;
  /** YYYY-MM-DD. */
  paidOn: string;
  notes: string | null;
};

export type PaymentFormState = {
  errors?: Partial<Record<keyof PaymentValues | "form", string[]>>;
  values?: PaymentValues;
  savedAt?: number;
};

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function oneOf<T extends string>(values: Record<string, T>, raw: string) {
  return (Object.values(values) as string[]).includes(raw) ? (raw as T) : null;
}

/** `today` es el día de Argentina (YYYY-MM-DD): no se cargan cobros a futuro. */
export function validatePaymentForm(
  formData: FormData,
  t: Messages,
  today: string = isoDay(new Date()),
):
  | { ok: true; data: PaymentInput; values: PaymentValues }
  | { ok: false; state: PaymentFormState } {
  const values: PaymentValues = {
    kind: text(formData, "kind") || "PAYMENT",
    amount: text(formData, "amount"),
    method: text(formData, "method"),
    paidOn: text(formData, "paidOn"),
    notes: text(formData, "notes"),
  };
  const errors: NonNullable<PaymentFormState["errors"]> = {};

  const kind = oneOf(CustomerPaymentKind, values.kind);
  if (!kind) errors.form = [t.invalid];
  const amount = parseDecimalInput(values.amount, MONEY_LIMITS);
  if (amount === null || Number(amount) <= 0) errors.amount = [t.amount];
  const method = oneOf(PaymentMethod, values.method);
  if (!method) errors.method = [t.method];
  const validDay =
    /^\d{4}-\d{2}-\d{2}$/.test(values.paidOn) &&
    !Number.isNaN(Date.parse(values.paidOn));
  if (!validDay) errors.paidOn = [t.paidOn];
  else if (values.paidOn > today) errors.paidOn = [t.futureDate];
  if (values.notes.length > PAYMENT_NOTES_MAX_LENGTH) {
    errors.notes = [interpolate(t.tooLong, { max: PAYMENT_NOTES_MAX_LENGTH })];
  }

  if (Object.keys(errors).length > 0 || !kind || !amount || !method) {
    return { ok: false, state: { errors, values } };
  }
  return {
    ok: true,
    values,
    data: {
      kind,
      amount,
      method,
      paidOn: values.paidOn,
      notes: values.notes || null,
    },
  };
}

/** Motivo obligatorio para anular un cobro. */
export function validateVoidReason(
  formData: FormData,
  t: Messages,
): { ok: true; reason: string } | { ok: false; error: string } {
  const reason = text(formData, "reason");
  if (!reason) return { ok: false, error: t.reasonRequired };
  if (reason.length > PAYMENT_NOTES_MAX_LENGTH) {
    return {
      ok: false,
      error: interpolate(t.tooLong, { max: PAYMENT_NOTES_MAX_LENGTH }),
    };
  }
  return { ok: true, reason };
}
