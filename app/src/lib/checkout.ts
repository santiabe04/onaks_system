import { z } from "zod";
import type { SaleState } from "@/generated/prisma/enums";
import { interpolate } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/es";
import { isCuid } from "./ids";

// Puro: validación de la confirmación del pedido.

export const NOTES_MAX_LENGTH = 500;

/**
 * Pedidos cuyo stock está reservado: confirmados y todavía sin descontar del
 * depósito (al prepararlos, en la fase 7, se descuenta y dejan de contar).
 */
export const RESERVED_SALE_STATES: SaleState[] = ["PENDING"];

type Messages = Dictionary["checkout"]["errors"];

export function checkoutSchema(t: Messages) {
  return z.object({
    addressId: z.string().refine(isCuid, t.addressRequired),
    // Vacío se guarda como null, no como "".
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

/** Lo que el usuario eligió, para volver a mostrarlo si hay errores. */
export type CheckoutValues = { addressId: string; notes: string };

export type CheckoutFormState = {
  errors?: Partial<Record<"addressId" | "notes" | "form", string[]>>;
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
  const values = { addressId: get("addressId"), notes: get("notes") };
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
        form: fieldErrors.fingerprint,
      },
      values,
    },
  };
}

/** "/orders/12" → 12; null si no es un número de pedido válido (int4). */
export function parseSaleNumber(raw: unknown): number | null {
  const parsed = z.coerce
    .number()
    .int()
    .positive()
    .max(2_147_483_647)
    .safeParse(raw);
  return parsed.success ? parsed.data : null;
}
