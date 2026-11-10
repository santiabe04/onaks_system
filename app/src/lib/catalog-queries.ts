import "server-only";
import type { Locale } from "@/i18n/config";
import { interpolate } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionary";
import { formatters } from "@/i18n/format";
import { VISIBLE_PRODUCT, visibleCategoryTree } from "./catalog";
import type { CategoryNode } from "./category";
import { db } from "./db";
import { getMostOrderedIds } from "./favorites-queries";
import { customerPrice, type Pricing } from "./customer-price";
import { finalPrice } from "./price";
import { productImageUrl } from "./product";

/** What the catalog shows for a product, already formatted (it is passed to Client Components). */
export type CatalogItem = {
  id: string;
  name: string;
  sku: string;
  description: string | null;
  imageUrl: string | null;
  /** Customer's final price (their list and their discount). */
  finalPrice: string;
  /** Base final price, only if the customer's is lower (it is shown crossed out). */
  baseFinalPrice: string | null;
  /** "Net $ 25.000,00 + VAT 10,5%". */
  netLine: string;
  /** "u · 15 kg". */
  unitLine: string;
  unitName: string;
  /** The unit allows quantities with decimals (kg, liters). */
  allowsDecimals: boolean;
  /** It is a favorite of the customer's company. */
  favorite: boolean;
};

/** Category tree of the menu: only the ones that have visible products. */
export async function getCatalogCategories(): Promise<CategoryNode[]> {
  const [rows, used] = await Promise.all([
    db.category.findMany({ select: { id: true, name: true, parentId: true } }),
    db.product.groupBy({ by: ["categoryId"], where: VISIBLE_PRODUCT }),
  ]);
  return visibleCategoryTree(rows, new Set(used.map((u) => u.categoryId)));
}

/** Fields needed to build a `CatalogItem`. */
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

/** How many products "What you order most" shows. */
export const MOST_ORDERED_COUNT = 4;

/** The company's most ordered, ready for `toCatalogItem` and in that order. */
export async function getMostOrderedProducts(
  customerId: string,
  limit: number,
) {
  const ids = await getMostOrderedIds(customerId, limit);
  if (ids.length === 0) return [];
  const products = await db.product.findMany({
    where: { id: { in: ids }, ...VISIBLE_PRODUCT },
    select: CATALOG_PRODUCT_SELECT,
  });
  return ids.flatMap((id) => products.find((p) => p.id === id) ?? []);
}

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
  pricing: Pricing,
  favorite = false,
): CatalogItem {
  const format = formatters(locale);
  const rate = product.taxRate.rate;
  const net = customerPrice(product.id, product.price, pricing);
  const base = finalPrice(product.price, rate);
  const final = finalPrice(net, rate);
  return {
    id: product.id,
    name: product.name,
    sku: product.sku,
    description: product.description,
    imageUrl: product.imageFile ? productImageUrl(product.imageFile) : null,
    finalPrice: format.money(final),
    baseFinalPrice: Number(final) < Number(base) ? format.money(base) : null,
    netLine: interpolate(t.netPlusTax, {
      net: format.money(net),
      rate: format.percent(product.taxRate.rate),
    }),
    unitName: product.measurementUnit.name,
    allowsDecimals: product.measurementUnit.allowsDecimals,
    favorite,
    unitLine: `${product.measurementUnit.name} · ${interpolate(t.weight, {
      weight: format.number(product.weight),
    })}`,
  };
}
