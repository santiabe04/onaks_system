import { z } from "zod";
import { interpolate } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/es";

// Pure: percentage conversion and validation of the tax rate form.

export const TAX_RATE_NAME_MAX_LENGTH = 40;

// Up to 100 with 2 decimals: the column is DECIMAL(5,4) as a fraction.
const PERCENT_PATTERN = /^(\d{1,3})(?:[.,](\d{1,2}))?$/;

/**
 * "10,5" or "10.5" → "0.1050" (fraction as a string, without going through floats).
 * null if it is not a valid percentage between 0 and 100 with up to 2 decimals.
 */
export function percentToFraction(raw: string): string | null {
  const match = PERCENT_PATTERN.exec(raw.trim());
  if (!match) return null;
  const hundredths =
    Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  if (hundredths > 10_000) return null;
  // 4 decimals of the fraction = hundredths of the percentage.
  const whole = Math.floor(hundredths / 10_000);
  const decimals = String(hundredths % 10_000).padStart(4, "0");
  return `${whole}.${decimals}`;
}

/** Stored fraction ("0.105" or a Decimal) → percentage as a number (10.5). */
export function fractionToPercent(rate: { toString(): string }): number {
  return Math.round(Number(rate.toString()) * 10_000) / 100;
}

type Messages = Dictionary["taxRates"]["errors"];

export type TaxRateValues = {
  name: string;
  percent: string;
  isActive: boolean;
};

export type TaxRateFormState = {
  errors?: Partial<Record<keyof TaxRateValues | "form", string[]>>;
  values?: TaxRateValues;
};

export type TaxRateInput = { name: string; rate: string; isActive: boolean };

function taxRateSchema(t: Messages) {
  return z.object({
    name: z
      .string()
      .trim()
      .min(1, t.nameRequired)
      .max(
        TAX_RATE_NAME_MAX_LENGTH,
        interpolate(t.tooLong, { max: TAX_RATE_NAME_MAX_LENGTH }),
      ),
    rate: z.string().transform((value, ctx) => {
      const fraction = percentToFraction(value);
      if (fraction !== null) return fraction;
      ctx.addIssue({ code: "custom", message: t.percentInvalid });
      return z.NEVER;
    }),
    isActive: z.boolean(),
  });
}

export function validateTaxRateForm(
  formData: FormData,
  t: Messages,
):
  | { ok: true; data: TaxRateInput; values: TaxRateValues }
  | { ok: false; state: TaxRateFormState } {
  const get = (key: string) => {
    const value = formData.get(key);
    return typeof value === "string" ? value : "";
  };
  const values: TaxRateValues = {
    name: get("name"),
    percent: get("percent"),
    // Checkbox: only comes in the form if it is ticked.
    isActive: formData.get("isActive") === "on",
  };
  const parsed = taxRateSchema(t).safeParse({
    name: values.name,
    rate: values.percent,
    isActive: values.isActive,
  });
  if (parsed.success) return { ok: true, data: parsed.data, values };

  // The form field is called `percent` even though the data is `rate`.
  const { rate, ...errors } = z.flattenError(parsed.error).fieldErrors;
  return {
    ok: false,
    state: { errors: { ...errors, percent: rate }, values },
  };
}

// The column is INTEGER (int4): anything out of range cannot exist.
const idSchema = z.coerce.number().int().positive().max(2_147_483_647);

/** Converts an id from the URL or a form into a number; null if it is not valid. */
export function parseTaxRateId(raw: unknown): number | null {
  const parsed = idSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
