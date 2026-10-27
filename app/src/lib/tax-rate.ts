import { z } from "zod";
import { interpolate } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/es";

// Puro: conversión de porcentajes y validación del form de alícuotas.

export const TAX_RATE_NAME_MAX_LENGTH = 40;

// Hasta 100 con 2 decimales: la columna es DECIMAL(5,4) como fracción.
const PERCENT_PATTERN = /^(\d{1,3})(?:[.,](\d{1,2}))?$/;

/**
 * "10,5" o "10.5" → "0.1050" (fracción como string, sin pasar por floats).
 * null si no es un porcentaje válido entre 0 y 100 con hasta 2 decimales.
 */
export function percentToFraction(raw: string): string | null {
  const match = PERCENT_PATTERN.exec(raw.trim());
  if (!match) return null;
  const hundredths =
    Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  if (hundredths > 10_000) return null;
  // 4 decimales de la fracción = centésimos del porcentaje.
  const whole = Math.floor(hundredths / 10_000);
  const decimals = String(hundredths % 10_000).padStart(4, "0");
  return `${whole}.${decimals}`;
}

/** Fracción guardada ("0.105" o un Decimal) → porcentaje como número (10.5). */
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
    // Checkbox: solo viene en el form si está tildado.
    isActive: formData.get("isActive") === "on",
  };
  const parsed = taxRateSchema(t).safeParse({
    name: values.name,
    rate: values.percent,
    isActive: values.isActive,
  });
  if (parsed.success) return { ok: true, data: parsed.data, values };

  // El campo del form se llama `percent` aunque el dato sea `rate`.
  const { rate, ...errors } = z.flattenError(parsed.error).fieldErrors;
  return {
    ok: false,
    state: { errors: { ...errors, percent: rate }, values },
  };
}

// La columna es INTEGER (int4): cualquier cosa fuera de rango no puede existir.
const idSchema = z.coerce.number().int().positive().max(2_147_483_647);

/** Convierte un id de la URL o de un form en número; null si no es válido. */
export function parseTaxRateId(raw: unknown): number | null {
  const parsed = idSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
