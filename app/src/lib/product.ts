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

// Pure: validation of the product form (used by the actions and the tests).

export const PRODUCT_LIMITS = {
  name: 120,
  sku: 40,
  description: 1000,
} as const;

// EAN-8, UPC-A (12), EAN-13 or GTIN-14.
const BARCODE_PATTERN = /^(\d{8}|\d{12,14})$/;

type Messages = Dictionary["products"]["errors"];

/** What the user entered, to show it again if there are errors. */
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
  tracksExpiry: boolean;
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
  /** Minimum stock (optional): below it an alert is raised and a purchase is suggested. */
  minStock: string | null;
  /** Tracks lot and expiry: outgoing stock takes what expires first. */
  tracksExpiry: boolean;
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
    // The SKU is stored in uppercase: "ace-001" and "ACE-001" are the same.
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
    // Empty is stored as null, not as "".
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
    tracksExpiry: z.boolean(),
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
    // Checkbox: only comes in the form if it is ticked.
    isActive: formData.get("isActive") === "on",
    tracksExpiry: formData.get("tracksExpiry") === "on",
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

/** Public URL of a stored image (served by `app/media/products/[file]`). */
export function productImageUrl(fileName: string): string {
  return `/media/products/${fileName}`;
}

/** Product ids are CUID2. */
export const isProductId = isCuid;
