import { z } from "zod";
import { interpolate } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/es";
import { parseDecimalInput, PRICE_LIMITS } from "./decimal-input";
import { percentToFraction } from "./tax-rate";

// Pure: validation of price lists, their fixed prices and the discount
// per customer.

export const PRICE_LIST_NAME_MAX_LENGTH = 60;

// Signed adjustment, up to 2 decimals: more than -100 % and up to 999.99 % (the
// column is DECIMAL(5,4) as a fraction).
const SIGNED_PERCENT = /^([+-])?\s*(\d{1,3})(?:[.,](\d{1,2}))?$/;

/** "-10", "+15,5" or "0" → "-0.1000" / "0.1550" / "0.0000"; null if it is not valid. */
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

/** "5" or "2,5" → "0.0500"; empty → "0". Less than 100 %: null if not. */
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
 * Fixed prices from the form (`price_<productId>`, net). Empty = no fixed price
 * (uses the list's adjustment). Only the products that are passed.
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
