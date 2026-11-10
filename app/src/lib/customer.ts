import { z } from "zod";
import { TaxCondition } from "@/generated/prisma/enums";
import { interpolate } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/es";
import { isValidCuit, normalizeCuit } from "./cuit";
import { parseDecimalInput, PRICE_LIMITS } from "./decimal-input";
import { isCuid } from "./ids";
import { discountToFraction } from "./price-list";

// Pure: validation of customers, their people and their delivery addresses.

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

/** Optional: empty is stored as null, not as "". */
function optional(t: Messages, max: number) {
  return text(t, max).transform((value) => value || null);
}

/** Field errors + what was loaded, to show the form again. */
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

// --- Customer ---

export type CustomerValues = {
  tradeName: string;
  legalName: string;
  cuit: string;
  taxCondition: string;
  /** "" = no list (base price). */
  priceListId: string;
  /** Percentage as typed ("5" or "2,5"). */
  discount: string;
  /** Amount as typed; "" = no limit. */
  creditLimit: string;
  /** Days; "" = no overdue debt control. */
  paymentTermDays: string;
};

export type CustomerInput = {
  tradeName: string;
  legalName: string;
  cuit: string;
  taxCondition: TaxCondition;
  priceListId: string | null;
  discountRate: string;
  creditLimit: string | null;
  paymentTermDays: number | null;
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
    priceListId: read(formData, "priceListId"),
    discount: read(formData, "discount"),
    creditLimit: read(formData, "creditLimit"),
    paymentTermDays: read(formData, "paymentTermDays"),
  };
  return validate(
    z
      .object({
        tradeName: text(t, CUSTOMER_LIMITS.tradeName).min(
          1,
          t.tradeNameRequired,
        ),
        legalName: text(t, CUSTOMER_LIMITS.legalName).min(
          1,
          t.legalNameRequired,
        ),
        // Stored without dashes: "30-50001091-2" → "30500010912".
        cuit: z
          .string()
          .transform(normalizeCuit)
          .refine(isValidCuit, t.cuitInvalid),
        taxCondition: z.enum(TaxCondition, { message: t.taxConditionRequired }),
        // That it exists is checked by the FK on save.
        priceListId: z
          .string()
          .refine((id) => id === "" || isCuid(id), t.priceListInvalid)
          .transform((id) => id || null),
        discount: z.string().transform((value, ctx) => {
          const fraction = discountToFraction(value);
          if (fraction !== null) return fraction;
          ctx.addIssue({ code: "custom", message: t.discountInvalid });
          return z.NEVER;
        }),
        creditLimit: z.string().transform((value, ctx) => {
          if (!value.trim()) return null;
          const amount = parseDecimalInput(value, PRICE_LIMITS);
          if (amount !== null) return amount;
          ctx.addIssue({ code: "custom", message: t.creditLimitInvalid });
          return z.NEVER;
        }),
        paymentTermDays: z.string().transform((value, ctx) => {
          if (!value.trim()) return null;
          const days = /^\d{1,3}$/.test(value.trim()) ? Number(value) : 0;
          if (days >= 1 && days <= 365) return days;
          ctx.addIssue({ code: "custom", message: t.paymentTermInvalid });
          return z.NEVER;
        }),
      })
      // The form says `discount` (percentage); the column, `discountRate` (fraction).
      .transform(({ discount, ...data }) => ({
        ...data,
        discountRate: discount,
      })),
    values,
  );
}

// --- Person ---

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
      // The email is the login: unique and in lowercase.
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

// --- Delivery address ---

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
