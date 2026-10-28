import { z } from "zod";
import { TaxCondition } from "@/generated/prisma/enums";
import { interpolate } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/es";
import { isValidCuit, normalizeCuit } from "./cuit";

// Puro: validación de clientes, sus personas y sus direcciones de entrega.

export const CUSTOMER_LIMITS = {
  tradeName: 120,
  legalName: 120,
  personName: 60,
  mail: 120,
  phone: 30,
  addressName: 60,
  addressDescription: 200,
  address: 120,
  zipCode: 10,
} as const;

type Messages = Dictionary["customers"]["errors"];

function read(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function text(t: Messages, max: number) {
  return z.string().trim().max(max, interpolate(t.tooLong, { max }));
}

/** Opcional: vacío se guarda como null, no como "". */
function optional(t: Messages, max: number) {
  return text(t, max).transform((value) => value || null);
}

/** Errores por campo + lo cargado, para volver a mostrar el form. */
export type FormState<V> = {
  errors?: Partial<Record<keyof V | "form", string[]>>;
  values?: V;
};

type Result<I, V> =
  { ok: true; data: I; values: V } | { ok: false; state: FormState<V> };

function validate<I, V extends Record<string, unknown>>(
  schema: z.ZodType<I>,
  values: V,
): Result<I, V> {
  const parsed = schema.safeParse(values);
  if (parsed.success) return { ok: true, data: parsed.data, values };
  return {
    ok: false,
    state: {
      errors: z.flattenError(parsed.error)
        .fieldErrors as FormState<V>["errors"],
      values,
    },
  };
}

// --- Cliente ---

export type CustomerValues = {
  tradeName: string;
  legalName: string;
  cuit: string;
  taxCondition: string;
};

export type CustomerInput = {
  tradeName: string;
  legalName: string;
  cuit: string;
  taxCondition: TaxCondition;
};

export function validateCustomerForm(
  formData: FormData,
  t: Messages,
): Result<CustomerInput, CustomerValues> {
  const values: CustomerValues = {
    tradeName: read(formData, "tradeName"),
    legalName: read(formData, "legalName"),
    cuit: read(formData, "cuit"),
    taxCondition: read(formData, "taxCondition"),
  };
  return validate(
    z.object({
      tradeName: text(t, CUSTOMER_LIMITS.tradeName).min(1, t.tradeNameRequired),
      legalName: text(t, CUSTOMER_LIMITS.legalName).min(1, t.legalNameRequired),
      // Se guarda sin guiones: "30-50001091-2" → "30500010912".
      cuit: z
        .string()
        .transform(normalizeCuit)
        .refine(isValidCuit, t.cuitInvalid),
      taxCondition: z.enum(TaxCondition, { message: t.taxConditionRequired }),
    }),
    values,
  );
}

// --- Persona ---

export type PersonValues = {
  name: string;
  surname: string;
  mail: string;
  phone: string;
};

export type PersonInput = {
  name: string;
  surname: string;
  mail: string;
  phone: string | null;
};

export function validatePersonForm(
  formData: FormData,
  t: Messages,
): Result<PersonInput, PersonValues> {
  const values: PersonValues = {
    name: read(formData, "name"),
    surname: read(formData, "surname"),
    mail: read(formData, "mail"),
    phone: read(formData, "phone"),
  };
  return validate(
    z.object({
      name: text(t, CUSTOMER_LIMITS.personName).min(1, t.nameRequired),
      surname: text(t, CUSTOMER_LIMITS.personName).min(1, t.surnameRequired),
      // El mail es el usuario para entrar: único y en minúsculas.
      mail: z
        .string()
        .trim()
        .toLowerCase()
        .max(CUSTOMER_LIMITS.mail)
        .pipe(z.email(t.mailInvalid)),
      phone: optional(t, CUSTOMER_LIMITS.phone),
    }),
    values,
  );
}

// --- Dirección de entrega ---

export type AddressValues = {
  name: string;
  address: string;
  cityId: string;
  zipCode: string;
  description: string;
};

export type AddressInput = {
  name: string;
  address: string;
  cityId: number;
  zipCode: string | null;
  description: string | null;
};

const intId = z.coerce.number().int().positive().max(2_147_483_647);

export function validateAddressForm(
  formData: FormData,
  t: Messages,
): Result<AddressInput, AddressValues> {
  const values: AddressValues = {
    name: read(formData, "name"),
    address: read(formData, "address"),
    cityId: read(formData, "cityId"),
    zipCode: read(formData, "zipCode"),
    description: read(formData, "description"),
  };
  return validate(
    z.object({
      name: text(t, CUSTOMER_LIMITS.addressName).min(1, t.addressNameRequired),
      address: text(t, CUSTOMER_LIMITS.address).min(1, t.addressRequired),
      cityId: z.string().transform((value, ctx) => {
        const id = intId.safeParse(value);
        if (id.success) return id.data;
        ctx.addIssue({ code: "custom", message: t.cityRequired });
        return z.NEVER;
      }),
      zipCode: optional(t, CUSTOMER_LIMITS.zipCode),
      description: optional(t, CUSTOMER_LIMITS.addressDescription),
    }),
    values,
  );
}
