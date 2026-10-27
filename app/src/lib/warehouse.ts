import { z } from "zod";
import { interpolate } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/es";

// Puro: validación del formulario de depósitos (la usan las actions y los tests).

export const WAREHOUSE_LIMITS = {
  name: 60,
  address: 120,
  phone: 30,
  contactName: 60,
} as const;

type Messages = Dictionary["warehouses"]["errors"];

/** Lo que el usuario cargó, para volver a mostrarlo si hay errores. */
export type WarehouseValues = {
  name: string;
  address: string;
  cityId: string;
  phone: string;
  contactName: string;
  isActive: boolean;
};

export type WarehouseFormState = {
  errors?: Partial<Record<keyof WarehouseValues | "form", string[]>>;
  values?: WarehouseValues;
};

export type WarehouseInput = {
  name: string;
  address: string;
  cityId: number;
  phone: string | null;
  contactName: string | null;
  isActive: boolean;
};

const intId = z.coerce.number().int().positive().max(2_147_483_647);

function warehouseSchema(t: Messages) {
  const text = (max: number) =>
    z.string().trim().max(max, interpolate(t.tooLong, { max }));
  // Vacío se guarda como null, no como "".
  const optional = (max: number) =>
    text(max).transform((value) => value || null);

  return z.object({
    name: text(WAREHOUSE_LIMITS.name).min(1, t.nameRequired),
    address: text(WAREHOUSE_LIMITS.address).min(1, t.addressRequired),
    cityId: z.string().transform((value, ctx) => {
      const id = intId.safeParse(value);
      if (id.success) return id.data;
      ctx.addIssue({ code: "custom", message: t.cityRequired });
      return z.NEVER;
    }),
    phone: optional(WAREHOUSE_LIMITS.phone),
    contactName: optional(WAREHOUSE_LIMITS.contactName),
    isActive: z.boolean(),
  });
}

export function validateWarehouseForm(
  formData: FormData,
  t: Messages,
):
  | { ok: true; data: WarehouseInput; values: WarehouseValues }
  | { ok: false; state: WarehouseFormState } {
  const get = (key: string) => {
    const value = formData.get(key);
    return typeof value === "string" ? value : "";
  };
  const values: WarehouseValues = {
    name: get("name"),
    address: get("address"),
    cityId: get("cityId"),
    phone: get("phone"),
    contactName: get("contactName"),
    // Checkbox: solo viene en el form si está tildado.
    isActive: formData.get("isActive") === "on",
  };
  const parsed = warehouseSchema(t).safeParse(values);
  if (parsed.success) return { ok: true, data: parsed.data, values };
  return {
    ok: false,
    state: { errors: z.flattenError(parsed.error).fieldErrors, values },
  };
}
