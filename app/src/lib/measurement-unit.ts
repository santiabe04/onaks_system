import { z } from "zod";
import { interpolate } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/es";

export const NAME_MAX_LENGTH = 20;
export const DESCRIPTION_MAX_LENGTH = 100;

type Messages = Dictionary["measurementUnits"]["errors"];

export function measurementUnitSchema(t: Messages) {
  return z.object({
    name: z
      .string()
      .trim()
      .min(1, t.nameRequired)
      .max(NAME_MAX_LENGTH, interpolate(t.tooLong, { max: NAME_MAX_LENGTH })),
    // Vacío se guarda como null, no como "".
    description: z
      .string()
      .trim()
      .max(
        DESCRIPTION_MAX_LENGTH,
        interpolate(t.tooLong, { max: DESCRIPTION_MAX_LENGTH }),
      )
      .transform((value) => value || null),
    // Si se puede vender "1,5" de esta unidad (kg, l) o solo enteros (u).
    allowsDecimals: z.boolean(),
  });
}

export type MeasurementUnitInput = z.infer<
  ReturnType<typeof measurementUnitSchema>
>;

/** Lo que el usuario tipeó, para volver a mostrarlo si hay errores. */
export type MeasurementUnitValues = {
  name: string;
  description: string;
  allowsDecimals: boolean;
};

export type MeasurementUnitFormState = {
  errors?: Partial<Record<keyof MeasurementUnitValues | "form", string[]>>;
  values?: MeasurementUnitValues;
};

function readMeasurementUnitForm(formData: FormData): MeasurementUnitValues {
  const get = (key: string) => {
    const value = formData.get(key);
    return typeof value === "string" ? value : "";
  };
  return {
    name: get("name"),
    description: get("description"),
    allowsDecimals: formData.get("allowsDecimals") === "on",
  };
}

export function validateMeasurementUnitForm(
  formData: FormData,
  t: Messages,
):
  | { ok: true; data: MeasurementUnitInput; values: MeasurementUnitValues }
  | { ok: false; state: MeasurementUnitFormState } {
  const values = readMeasurementUnitForm(formData);
  const parsed = measurementUnitSchema(t).safeParse(values);
  if (parsed.success) return { ok: true, data: parsed.data, values };
  return {
    ok: false,
    state: { errors: z.flattenError(parsed.error).fieldErrors, values },
  };
}

// La columna es INTEGER (int4): cualquier cosa fuera de rango no puede existir.
const unitIdSchema = z.coerce.number().int().positive().max(2_147_483_647);

/** Convierte el id de la URL o de un form en número; null si no es válido. */
export function parseUnitId(raw: unknown): number | null {
  const parsed = unitIdSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
