import { z } from "zod";
import { interpolate } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/es";

// Puro: validación de provincias y localidades (las usan las actions y los tests).

export const LOCATION_NAME_MAX_LENGTH = 80;

type Messages = Dictionary["locations"]["errors"];

export type StateValues = { name: string };
export type CityValues = { name: string; stateId: string };

export type StateFormState = {
  errors?: Partial<Record<keyof StateValues | "form", string[]>>;
  values?: StateValues;
};

export type CityFormState = {
  errors?: Partial<Record<keyof CityValues | "form", string[]>>;
  values?: CityValues;
};

// La columna es INTEGER (int4): cualquier cosa fuera de rango no puede existir.
const idSchema = z.coerce.number().int().positive().max(2_147_483_647);

/** Convierte un id de la URL o de un form en número; null si no es válido. */
export function parseLocationId(raw: unknown): number | null {
  const parsed = idSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

function nameSchema(t: Messages) {
  return z
    .string()
    .trim()
    .min(1, t.nameRequired)
    .max(
      LOCATION_NAME_MAX_LENGTH,
      interpolate(t.tooLong, { max: LOCATION_NAME_MAX_LENGTH }),
    );
}

function read(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export function validateStateForm(
  formData: FormData,
  t: Messages,
):
  | { ok: true; data: { name: string }; values: StateValues }
  | { ok: false; state: StateFormState } {
  const values = { name: read(formData, "name") };
  const parsed = z.object({ name: nameSchema(t) }).safeParse(values);
  if (parsed.success) return { ok: true, data: parsed.data, values };
  return {
    ok: false,
    state: { errors: z.flattenError(parsed.error).fieldErrors, values },
  };
}

export function validateCityForm(
  formData: FormData,
  t: Messages,
):
  | { ok: true; data: { name: string; stateId: number }; values: CityValues }
  | { ok: false; state: CityFormState } {
  const values = {
    name: read(formData, "name"),
    stateId: read(formData, "stateId"),
  };
  const parsed = z
    .object({
      name: nameSchema(t),
      stateId: z.string().transform((value, ctx) => {
        const id = parseLocationId(value);
        if (id !== null) return id;
        ctx.addIssue({ code: "custom", message: t.stateRequired });
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
