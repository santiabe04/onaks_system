import { z } from "zod";
import { interpolate } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/es";
import { parseDecimalInput } from "./decimal-input";
import { isCuid } from "./ids";

// Puro: validación de los formularios de repartidores y vehículos.

export const FLEET_LIMITS = {
  name: 60,
  phone: 30,
  plate: 15,
} as const;

/** Capacidad en kg o litros: hasta 3 decimales, como el peso de los productos. */
const CAPACITY_LIMITS = { maxDecimals: 3, maxIntegerDigits: 7 };

type Messages = Dictionary["fleet"]["errors"];

function read(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function text(t: Messages, max: number) {
  return z.string().trim().max(max, interpolate(t.tooLong, { max }));
}

/** Vacío se guarda como null, no como "". */
function optional(t: Messages, max: number) {
  return text(t, max).transform((value) => value || null);
}

export type FormState<V> = {
  errors?: Partial<Record<keyof V | "form", string[]>>;
  values?: V;
};

function fail<V>(error: z.ZodError, values: V) {
  return {
    ok: false as const,
    state: {
      errors: z.flattenError(error).fieldErrors as FormState<V>["errors"],
      values,
    },
  };
}

// --- Repartidores ---

export type DriverValues = {
  name: string;
  phone: string;
  userId: string;
  isActive: boolean;
};

export type DriverInput = {
  name: string;
  phone: string | null;
  /** Usuario (Repartidor o Admin) que carga sus entregas desde el celular. */
  userId: string | null;
  isActive: boolean;
};

export function validateDriverForm(formData: FormData, t: Messages) {
  const values: DriverValues = {
    name: read(formData, "name"),
    phone: read(formData, "phone"),
    userId: read(formData, "userId"),
    // Checkbox: solo viene en el form si está tildado.
    isActive: formData.get("isActive") === "on",
  };
  const parsed = z
    .object({
      name: text(t, FLEET_LIMITS.name).min(1, t.nameRequired),
      phone: optional(t, FLEET_LIMITS.phone),
      userId: z
        .string()
        .refine((value) => value === "" || isCuid(value), t.invalid)
        .transform((value) => value || null),
      isActive: z.boolean(),
    })
    .safeParse(values);
  if (!parsed.success) return fail(parsed.error, values);
  return { ok: true as const, data: parsed.data as DriverInput, values };
}

// --- Vehículos ---

export type VehicleValues = {
  name: string;
  plate: string;
  capacityKg: string;
  capacityLiters: string;
  isActive: boolean;
};

export type VehicleInput = {
  name: string;
  /** En mayúsculas y sin espacios ("AB123CD"). */
  plate: string | null;
  capacityKg: string | null;
  capacityLiters: string | null;
  isActive: boolean;
};

function capacity(t: Messages) {
  return z.string().transform((value, ctx) => {
    if (value.trim() === "") return null;
    const parsed = parseDecimalInput(value, CAPACITY_LIMITS);
    if (parsed === null || Number(parsed) <= 0) {
      ctx.addIssue({ code: "custom", message: t.capacity });
      return z.NEVER;
    }
    return parsed;
  });
}

export function validateVehicleForm(formData: FormData, t: Messages) {
  const values: VehicleValues = {
    name: read(formData, "name"),
    plate: read(formData, "plate"),
    capacityKg: read(formData, "capacityKg"),
    capacityLiters: read(formData, "capacityLiters"),
    isActive: formData.get("isActive") === "on",
  };
  const parsed = z
    .object({
      name: text(t, FLEET_LIMITS.name).min(1, t.nameRequired),
      plate: z
        .string()
        .transform((value) => value.replace(/\s+/g, "").toUpperCase())
        .pipe(
          z
            .string()
            .max(
              FLEET_LIMITS.plate,
              interpolate(t.tooLong, { max: FLEET_LIMITS.plate }),
            ),
        )
        .transform((value) => value || null),
      capacityKg: capacity(t),
      capacityLiters: capacity(t),
      isActive: z.boolean(),
    })
    .safeParse(values);
  if (!parsed.success) return fail(parsed.error, values);
  return { ok: true as const, data: parsed.data as VehicleInput, values };
}
