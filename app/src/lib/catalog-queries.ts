import "server-only";
import type { Locale } from "@/i18n/config";
import { interpolate } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionary";
import { formatters } from "@/i18n/format";
import { VISIBLE_PRODUCT, visibleCategoryTree } from "./catalog";
import type { CategoryNode } from "./category";
import { db } from "./db";
import { finalPrice } from "./price";
import { productImageUrl } from "./product";

/** Lo que muestra el catálogo de un producto, ya formateado (se pasa a Client Components). */
export type CatalogItem = {
  id: string;
  name: string;
  sku: string;
  description: string | null;
  imageUrl: string | null;
  finalPrice: string;
  /** "Neto $ 25.000,00 + IVA 10,5%". */
  netLine: string;
  /** "u · 15 kg". */
  unitLine: string;
  unitName: string;
  /** La unidad admite cantidades con decimales (kg, litros). */
  allowsDecimals: boolean;
};

/** Árbol de categorías del menú: solo las que tienen productos visibles. */
export async function getCatalogCategories(): Promise<CategoryNode[]> {
  const [rows, used] = await Promise.all([
    db.category.findMany({ select: { id: true, name: true, parentId: true } }),
    db.product.groupBy({ by: ["categoryId"], where: VISIBLE_PRODUCT }),
  ]);
  return visibleCategoryTree(rows, new Set(used.map((u) => u.categoryId)));
}

/** Campos que hacen falta para armar un `CatalogItem`. */
export const CATALOG_PRODUCT_SELECT = {
  id: true,
  name: true,
  sku: true,
  description: true,
  imageFile: true,
  price: true,
  weight: true,
  taxRate: { select: { rate: true } },
  measurementUnit: { select: { name: true, allowsDecimals: true } },
} as const;

type CatalogProduct = {
  id: string;
  name: string;
  sku: string;
  description: string | null;
  imageFile: string | null;
  price: { toString(): string };
  weight: { toString(): string };
  taxRate: { rate: { toString(): string } };
  measurementUnit: { name: string; allowsDecimals: boolean };
};

export function toCatalogItem(
  product: CatalogProduct,
  locale: Locale,
  t: Dictionary["catalog"],
): CatalogItem {
  const format = formatters(locale);
  return {
    id: product.id,
    name: product.name,
    sku: product.sku,
    description: product.description,
    imageUrl: product.imageFile ? productImageUrl(product.imageFile) : null,
    finalPrice: format.money(finalPrice(product.price, product.taxRate.rate)),
    netLine: interpolate(t.netPlusTax, {
      net: format.money(product.price),
      rate: format.percent(product.taxRate.rate),
    }),
    unitName: product.measurementUnit.name,
    allowsDecimals: product.measurementUnit.allowsDecimals,
    unitLine: `${product.measurementUnit.name} · ${interpolate(t.weight, {
      weight: format.number(product.weight),
    })}`,
  };
}
