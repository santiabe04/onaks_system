import { z } from "zod";
import { TaxCondition } from "@/generated/prisma/enums";
import { interpolate } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/es";
import { isValidCuit, normalizeCuit } from "./cuit";
import { parseDecimalInput, PRICE_LIMITS } from "./decimal-input";
import { isCuid } from "./ids";

// Puro: validación de proveedores y de los productos que proveen.

export const SUPPLIER_LIMITS = {
  legalName: 120,
  tradeName: 120,
  contactName: 80,
  contactMail: 120,
  contactPhone: 30,
  address: 120,
  supplierCode: 40,
} as const;

type Messages = Dictionary["suppliers"]["errors"];

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

// --- Proveedor ---

export type SupplierValues = {
  legalName: string;
  tradeName: string;
  cuit: string;
  taxCondition: string;
  contactName: string;
  contactMail: string;
  contactPhone: string;
  address: string;
  cityId: string;
  isActive: boolean;
};

export type SupplierFormState = {
  errors?: Partial<Record<keyof SupplierValues | "form", string[]>>;
  values?: SupplierValues;
};

const intId = z.coerce.number().int().positive().max(2_147_483_647);

function supplierSchema(t: Messages) {
  return (
    z
      .object({
        legalName: text(t, SUPPLIER_LIMITS.legalName).min(
          1,
          t.legalNameRequired,
        ),
        tradeName: optional(t, SUPPLIER_LIMITS.tradeName),
        // Se guarda sin guiones: "30-50001091-2" → "30500010912".
        cuit: z
          .string()
          .transform(normalizeCuit)
          .refine(isValidCuit, t.cuitInvalid),
        taxCondition: z.enum(TaxCondition, { message: t.taxConditionRequired }),
        contactName: optional(t, SUPPLIER_LIMITS.contactName),
        contactMail: z
          .string()
          .trim()
          .toLowerCase()
          .max(SUPPLIER_LIMITS.contactMail)
          .refine(
            (value) => value === "" || z.email().safeParse(value).success,
            t.mailInvalid,
          )
          .transform((value) => value || null),
        contactPhone: optional(t, SUPPLIER_LIMITS.contactPhone),
        address: optional(t, SUPPLIER_LIMITS.address),
        cityId: z.string().transform((value, ctx) => {
          if (value === "") return null;
          const id = intId.safeParse(value);
          if (id.success) return id.data;
          ctx.addIssue({ code: "custom", message: t.cityRequired });
          return z.NEVER;
        }),
        isActive: z.boolean(),
      })
      // Dirección y localidad van juntas: una sin la otra no sirve para retirar.
      .superRefine((data, ctx) => {
        if (data.address && data.cityId === null) {
          ctx.addIssue({
            code: "custom",
            path: ["cityId"],
            message: t.cityRequired,
          });
        }
        if (!data.address && data.cityId !== null) {
          ctx.addIssue({
            code: "custom",
            path: ["address"],
            message: t.addressRequired,
          });
        }
      })
  );
}

export type SupplierInput = z.infer<ReturnType<typeof supplierSchema>>;

export function validateSupplierForm(
  formData: FormData,
  t: Messages,
):
  | { ok: true; data: SupplierInput; values: SupplierValues }
  | { ok: false; state: SupplierFormState } {
  const values: SupplierValues = {
    legalName: read(formData, "legalName"),
    tradeName: read(formData, "tradeName"),
    cuit: read(formData, "cuit"),
    taxCondition: read(formData, "taxCondition"),
    contactName: read(formData, "contactName"),
    contactMail: read(formData, "contactMail"),
    contactPhone: read(formData, "contactPhone"),
    address: read(formData, "address"),
    cityId: read(formData, "cityId"),
    // Checkbox: solo viene en el form si está tildado.
    isActive: formData.get("isActive") === "on",
  };
  const parsed = supplierSchema(t).safeParse(values);
  if (parsed.success) return { ok: true, data: parsed.data, values };
  return {
    ok: false,
    state: { errors: z.flattenError(parsed.error).fieldErrors, values },
  };
}

// --- Producto del proveedor ---

export type SupplierProductValues = {
  productId: string;
  supplierCode: string;
  lastCost: string;
};

export type SupplierProductFormState = {
  errors?: Partial<Record<keyof SupplierProductValues | "form", string[]>>;
  values?: SupplierProductValues;
  /** Para limpiar el form después de guardar bien. */
  savedAt?: number;
};

export type SupplierProductInput = {
  productId: string;
  supplierCode: string | null;
  /** Costo neto; null si todavía no se conoce. */
  lastCost: string | null;
};

export function validateSupplierProductForm(
  formData: FormData,
  t: Messages,
):
  | { ok: true; data: SupplierProductInput; values: SupplierProductValues }
  | { ok: false; state: SupplierProductFormState } {
  const values: SupplierProductValues = {
    productId: read(formData, "productId"),
    supplierCode: read(formData, "supplierCode"),
    lastCost: read(formData, "lastCost"),
  };
  const parsed = z
    .object({
      productId: z.string().refine(isCuid, t.productRequired),
      supplierCode: optional(t, SUPPLIER_LIMITS.supplierCode),
      lastCost: z.string().transform((value, ctx) => {
        if (value.trim() === "") return null;
        const cost = parseDecimalInput(value, PRICE_LIMITS);
        if (cost !== null) return cost;
        ctx.addIssue({ code: "custom", message: t.costInvalid });
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
