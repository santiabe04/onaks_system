import { z } from "zod";
import type { SaleState } from "@/generated/prisma/enums";
import { interpolate } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/es";
import { isCuid } from "./ids";

// Pure: validation of the order confirmation.

export const NOTES_MAX_LENGTH = 500;

/**
 * Orders whose stock is reserved: confirmed and not yet deducted from the
 * warehouse (when prepared, in phase 7, it is deducted and they stop counting).
 */
export const RESERVED_SALE_STATES: SaleState[] = ["PENDING"];

type Messages = Dictionary["checkout"]["errors"];

/** How the order is paid: cash on delivery or transfer with a receipt. */
export const CHECKOUT_PAYMENT_METHODS = ["CASH", "TRANSFER"] as const;

export function checkoutSchema(t: Messages) {
  return z.object({
    addressId: z.string().refine(isCuid, t.addressRequired),
    paymentMethod: z.enum(CHECKOUT_PAYMENT_METHODS, {
      message: t.paymentMethodInvalid,
    }),
    // Empty is stored as null, not as "".
    notes: z
      .string()
      .trim()
      .max(
        NOTES_MAX_LENGTH,
        interpolate(t.notesTooLong, { max: NOTES_MAX_LENGTH }),
      )
      .transform((value) => value || null),
    fingerprint: z.string().regex(/^[0-9a-f]{64}$/, t.cartChanged),
  });
}

export type CheckoutInput = z.infer<ReturnType<typeof checkoutSchema>>;

/** What the user chose, to show it again if there are errors. */
export type CheckoutValues = {
  addressId: string;
  notes: string;
  paymentMethod: string;
};

export type CheckoutFormState = {
  errors?: Partial<
    Record<"addressId" | "notes" | "paymentMethod" | "form", string[]>
  >;
  values?: CheckoutValues;
};

export function validateCheckoutForm(
  formData: FormData,
  t: Messages,
):
  | { ok: true; data: CheckoutInput; values: CheckoutValues }
  | { ok: false; state: CheckoutFormState } {
  const get = (key: string) => {
    const value = formData.get(key);
    return typeof value === "string" ? value : "";
  };
  const values = {
    addressId: get("addressId"),
    notes: get("notes"),
    // Not chosen (an old form) is cash, as before.
    paymentMethod: get("paymentMethod") || "CASH",
  };
  const parsed = checkoutSchema(t).safeParse({
    ...values,
    fingerprint: get("fingerprint"),
  });
  if (parsed.success) return { ok: true, data: parsed.data, values };

  const fieldErrors = z.flattenError(parsed.error).fieldErrors;
  return {
    ok: false,
    state: {
      errors: {
        addressId: fieldErrors.addressId,
        notes: fieldErrors.notes,
        paymentMethod: fieldErrors.paymentMethod,
        form: fieldErrors.fingerprint,
      },
      values,
    },
  };
}

/** "/orders/12" → 12; null if it is not a valid order number (int4). */
export function parseSaleNumber(raw: unknown): number | null {
  const parsed = z.coerce
    .number()
    .int()
    .positive()
    .max(2_147_483_647)
    .safeParse(raw);
  return parsed.success ? parsed.data : null;
}
