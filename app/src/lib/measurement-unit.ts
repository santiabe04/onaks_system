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
    // Empty is stored as null, not as "".
    description: z
      .string()
      .trim()
      .max(
        DESCRIPTION_MAX_LENGTH,
        interpolate(t.tooLong, { max: DESCRIPTION_MAX_LENGTH }),
      )
      .transform((value) => value || null),
    // Whether "1,5" of this unit can be sold (kg, l) or only whole numbers (u).
    allowsDecimals: z.boolean(),
  });
}

export type MeasurementUnitInput = z.infer<
  ReturnType<typeof measurementUnitSchema>
>;

/** What the user typed, to show it again if there are errors. */
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

// The column is INTEGER (int4): anything out of range cannot exist.
const unitIdSchema = z.coerce.number().int().positive().max(2_147_483_647);

/** Converts the id from the URL or a form into a number; null if it is not valid. */
export function parseUnitId(raw: unknown): number | null {
  const parsed = unitIdSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
