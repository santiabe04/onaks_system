import type { PaymentMethod } from "@/generated/prisma/enums";
import { interpolate } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/es";
import { fromCents, toCents } from "./account";
import { parseDecimalInput } from "./decimal-input";

// Pure: closing a route sheet and the driver's cash count.

export const CLOSING_NOTES_MAX_LENGTH = 300;
const MONEY_LIMITS = { maxDecimals: 2, maxIntegerDigits: 10 };

type Numeric = { toString(): string } | string;

export type StopCollection = {
  status: "PENDING" | "DELIVERED" | "NOT_DELIVERED";
  payment: {
    amount: Numeric;
    method: PaymentMethod;
    voidedAt: Date | null;
  } | null;
};

export type CollectionSummary = {
  /** What was collected at the stops by payment method (without voided ones). */
  byMethod: Partial<Record<PaymentMethod, string>>;
  /** The cash the driver has to hand in. */
  cashExpected: string;
  /** Stops not loaded: with any of them, the sheet cannot be closed. */
  pendingStops: number;
};

export function summarizeCollections(
  stops: StopCollection[],
): CollectionSummary {
  const byMethod: Partial<Record<PaymentMethod, bigint>> = {};
  let pendingStops = 0;
  for (const stop of stops) {
    if (stop.status === "PENDING") pendingStops += 1;
    const payment = stop.payment;
    if (!payment || payment.voidedAt) continue;
    byMethod[payment.method] =
      (byMethod[payment.method] ?? BigInt(0)) + toCents(payment.amount);
  }
  const formatted: CollectionSummary["byMethod"] = {};
  for (const [method, cents] of Object.entries(byMethod)) {
    formatted[method as PaymentMethod] = fromCents(cents);
  }
  return {
    byMethod: formatted,
    cashExpected: fromCents(byMethod.CASH ?? BigInt(0)),
    pendingStops,
  };
}

type Messages = Dictionary["routes"]["closing"]["errors"];

export type ClosingInput = {
  cashReceived: string;
  /** Received − expected: negative is a shortage, positive a surplus. */
  difference: string;
  notes: string | null;
};

/** What the driver handed in; if it does not match the expected one, the reason why. */
export function validateClosingForm(
  formData: FormData,
  cashExpected: Numeric,
  t: Messages,
): { ok: true; data: ClosingInput } | { ok: false; error: string } {
  const read = (key: string) => {
    const value = formData.get(key);
    return typeof value === "string" ? value.trim() : "";
  };
  const received = parseDecimalInput(read("cashReceived"), MONEY_LIMITS);
  if (received === null) return { ok: false, error: t.cashReceived };
  const notes = read("notes");
  if (notes.length > CLOSING_NOTES_MAX_LENGTH) {
    return {
      ok: false,
      error: interpolate(t.tooLong, { max: CLOSING_NOTES_MAX_LENGTH }),
    };
  }
  const difference = toCents(received) - toCents(cashExpected);
  if (difference !== BigInt(0) && !notes) {
    return { ok: false, error: t.differenceNotes };
  }
  return {
    ok: true,
    data: {
      cashReceived: fromCents(toCents(received)),
      difference: fromCents(difference),
      notes: notes || null,
    },
  };
}
