import { z } from "zod";
import { interpolate } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/es";
import { parseDecimalInput, PRICE_LIMITS } from "./decimal-input";
import { percentToFraction } from "./tax-rate";

// Puro: validación de listas de precios, sus precios fijos y el descuento
// por cliente.

export const PRICE_LIST_NAME_MAX_LENGTH = 60;

// Ajuste con signo, hasta 2 decimales: más de -100 % y hasta 999,99 % (la
// columna es DECIMAL(5,4) como fracción).
const SIGNED_PERCENT = /^([+-])?\s*(\d{1,3})(?:[.,](\d{1,2}))?$/;

/** "-10", "+15,5" o "0" → "-0.1000" / "0.1550" / "0.0000"; null si no es válido. */
export function adjustmentToFraction(raw: string): string | null {
  const match = SIGNED_PERCENT.exec(raw.trim());
  if (!match) return null;
  const hundredths =
    Number(match[2]) * 100 + Number((match[3] ?? "").padEnd(2, "0"));
  const negative = match[1] === "-" && hundredths > 0;
  if (negative && hundredths >= 10_000) return null;
  const whole = Math.floor(hundredths / 10_000);
  const decimals = String(hundredths % 10_000).padStart(4, "0");
  return `${negative ? "-" : ""}${whole}.${decimals}`;
}

/** "5" o "2,5" → "0.0500"; vacío → "0". Menos de 100 %: null si no. */
export function discountToFraction(raw: string): string | null {
  if (!raw.trim()) return "0";
  const fraction = percentToFraction(raw);
  if (fraction === null || Number(fraction) >= 1) return null;
  return fraction;
}

type Messages = Dictionary["priceLists"]["errors"];

export type PriceListValues = { name: string; adjustment: string };

export type PriceListFormState = {
  errors?: Partial<Record<keyof PriceListValues | "form", string[]>>;
  values?: PriceListValues;
};

export type PriceListInput = { name: string; adjustment: string };

export function validatePriceListForm(
  formData: FormData,
  t: Messages,
):
  | { ok: true; data: PriceListInput; values: PriceListValues }
  | { ok: false; state: PriceListFormState } {
  const get = (key: string) => {
    const value = formData.get(key);
    return typeof value === "string" ? value : "";
  };
  const values: PriceListValues = {
    name: get("name"),
    adjustment: get("adjustment"),
  };
  const parsed = z
    .object({
      name: z
        .string()
        .trim()
        .min(1, t.nameRequired)
        .max(
          PRICE_LIST_NAME_MAX_LENGTH,
          interpolate(t.tooLong, { max: PRICE_LIST_NAME_MAX_LENGTH }),
        ),
      adjustment: z.string().transform((value, ctx) => {
        const fraction = adjustmentToFraction(value);
        if (fraction !== null) return fraction;
        ctx.addIssue({ code: "custom", message: t.adjustmentInvalid });
        return z.NEVER;
      }),
    })
    .safeParse(values);
  if (parsed.success) return { ok: true, data: parsed.data, values };
  return {
    ok: false,
    state: { errors: z.flattenError(parsed.error).fieldErrors, values },
  };
}

/**
 * Precios fijos del form (`price_<productId>`, neto). Vacío = sin precio fijo
 * (usa el ajuste de la lista). Solo los productos que se pasan.
 */
export function parseFixedPrices(
  formData: FormData,
  productIds: string[],
  t: Messages,
):
  | { ok: true; prices: { productId: string; price: string | null }[] }
  | { ok: false; error: string } {
  const prices: { productId: string; price: string | null }[] = [];
  for (const productId of productIds) {
    const raw = formData.get(`price_${productId}`);
    if (typeof raw !== "string") continue;
    if (!raw.trim()) {
      prices.push({ productId, price: null });
      continue;
    }
    const price = parseDecimalInput(raw, PRICE_LIMITS);
    if (price === null || Number(price) <= 0) {
      return { ok: false, error: t.priceInvalid };
    }
    prices.push({ productId, price });
  }
  return { ok: true, prices };
}
