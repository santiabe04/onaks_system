import { z } from "zod";
import { QUANTITY_LIMITS } from "./quantity";
import { isCuid } from "./ids";
import { interpolate } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/es";
import {
  MEASURE_LIMITS,
  parseDecimalInput,
  PRICE_LIMITS,
  type DecimalLimits,
} from "./decimal-input";

// Puro: validación del formulario de productos (la usan las actions y los tests).

export const PRODUCT_LIMITS = {
  name: 120,
  sku: 40,
  description: 1000,
} as const;

// EAN-8, UPC-A (12), EAN-13 o GTIN-14.
const BARCODE_PATTERN = /^(\d{8}|\d{12,14})$/;

type Messages = Dictionary["products"]["errors"];

/** Lo que el usuario cargó, para volver a mostrarlo si hay errores. */
export type ProductValues = {
  name: string;
  sku: string;
  barcode: string;
  description: string;
  categoryId: string;
  measurementUnitId: string;
  taxRateId: string;
  price: string;
  weight: string;
  volume: string;
  minStock: string;
  isActive: boolean;
};

export type ProductField = keyof ProductValues | "image";

export type ProductFormState = {
  errors?: Partial<Record<ProductField | "form", string[]>>;
  values?: ProductValues;
};

export type ProductInput = {
  name: string;
  sku: string;
  barcode: string | null;
  description: string | null;
  categoryId: number;
  measurementUnitId: number;
  taxRateId: number;
  price: string;
  weight: string;
  volume: string | null;
  /** Stock mínimo (opcional): debajo se alerta y se sugiere comprar. */
  minStock: string | null;
  isActive: boolean;
};

const intId = z.coerce.number().int().positive().max(2_147_483_647);

function productSchema(t: Messages) {
  const text = (max: number) =>
    z.string().trim().max(max, interpolate(t.tooLong, { max }));

  const id = (message: string) =>
    z.string().transform((value, ctx) => {
      const parsed = intId.safeParse(value);
      if (parsed.success) return parsed.data;
      ctx.addIssue({ code: "custom", message });
      return z.NEVER;
    });

  const decimal = (limits: DecimalLimits, message: string) =>
    z.string().transform((value, ctx) => {
      const parsed = parseDecimalInput(value, limits);
      if (parsed !== null) return parsed;
      ctx.addIssue({ code: "custom", message });
      return z.NEVER;
    });

  return z.object({
    name: text(PRODUCT_LIMITS.name).min(1, t.nameRequired),
    // El SKU se guarda en mayúsculas: "ace-001" y "ACE-001" son el mismo.
    sku: text(PRODUCT_LIMITS.sku)
      .min(1, t.skuRequired)
      .regex(/^[A-Za-z0-9._-]+$/, t.skuFormat)
      .transform((value) => value.toUpperCase()),
    barcode: z
      .string()
      .trim()
      .refine(
        (value) => value === "" || BARCODE_PATTERN.test(value),
        t.barcodeFormat,
      )
      .transform((value) => value || null),
    // Vacío se guarda como null, no como "".
    description: text(PRODUCT_LIMITS.description).transform(
      (value) => value || null,
    ),
    categoryId: id(t.categoryRequired),
    measurementUnitId: id(t.unitRequired),
    taxRateId: id(t.taxRateRequired),
    price: decimal(PRICE_LIMITS, t.priceInvalid),
    weight: decimal(MEASURE_LIMITS, t.weightInvalid).refine(
      (value) => Number(value) > 0,
      t.weightInvalid,
    ),
    volume: z.string().transform((value, ctx) => {
      if (value.trim() === "") return null;
      const parsed = parseDecimalInput(value, MEASURE_LIMITS);
      if (parsed !== null) return parsed;
      ctx.addIssue({ code: "custom", message: t.volumeInvalid });
      return z.NEVER;
    }),
    minStock: z.string().transform((value, ctx) => {
      if (value.trim() === "") return null;
      const parsed = parseDecimalInput(value, QUANTITY_LIMITS);
      if (parsed !== null) return parsed;
      ctx.addIssue({ code: "custom", message: t.minStockInvalid });
      return z.NEVER;
    }),
    isActive: z.boolean(),
  });
}

export function readProductForm(formData: FormData): ProductValues {
  const get = (key: keyof ProductValues) => {
    const value = formData.get(key);
    return typeof value === "string" ? value : "";
  };
  return {
    name: get("name"),
    sku: get("sku"),
    barcode: get("barcode"),
    description: get("description"),
    categoryId: get("categoryId"),
    measurementUnitId: get("measurementUnitId"),
    taxRateId: get("taxRateId"),
    price: get("price"),
    weight: get("weight"),
    volume: get("volume"),
    minStock: get("minStock"),
    // Checkbox: solo viene en el form si está tildado.
    isActive: formData.get("isActive") === "on",
  };
}

export function validateProductForm(
  formData: FormData,
  t: Messages,
):
  | { ok: true; data: ProductInput; values: ProductValues }
  | { ok: false; state: ProductFormState } {
  const values = readProductForm(formData);
  const parsed = productSchema(t).safeParse(values);
  if (parsed.success) return { ok: true, data: parsed.data, values };
  return {
    ok: false,
    state: { errors: z.flattenError(parsed.error).fieldErrors, values },
  };
}

/** URL pública de una imagen guardada (la sirve `app/media/products/[file]`). */
export function productImageUrl(fileName: string): string {
  return `/media/products/${fileName}`;
}

/** Los ids de productos son CUID2. */
export const isProductId = isCuid;
