import { z } from "zod";

export const measurementUnitSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "El nombre es obligatorio")
    .max(20, "Máximo 20 caracteres"),
  // Vacío se guarda como null, no como "".
  description: z
    .string()
    .trim()
    .max(100, "Máximo 100 caracteres")
    .transform((value) => value || null),
});

export type MeasurementUnitInput = z.infer<typeof measurementUnitSchema>;

/** Lo que el usuario tipeó, para volver a mostrarlo si hay errores. */
export type MeasurementUnitValues = { name: string; description: string };

export type MeasurementUnitFormState = {
  errors?: Partial<Record<keyof MeasurementUnitValues | "form", string[]>>;
  values?: MeasurementUnitValues;
};

export type DeleteMeasurementUnitState = { error?: string };

function readMeasurementUnitForm(formData: FormData): MeasurementUnitValues {
  const get = (key: string) => {
    const value = formData.get(key);
    return typeof value === "string" ? value : "";
  };
  return { name: get("name"), description: get("description") };
}

export function validateMeasurementUnitForm(
  formData: FormData,
):
  | { ok: true; data: MeasurementUnitInput; values: MeasurementUnitValues }
  | { ok: false; state: MeasurementUnitFormState } {
  const values = readMeasurementUnitForm(formData);
  const parsed = measurementUnitSchema.safeParse(values);
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
