import "server-only";
import { flattenCategoryTree } from "@/lib/category";
import { db } from "@/lib/db";

export type ProductFormOptions = {
  /** Only leaf categories, with the full path as the label. */
  categories: { id: number; label: string }[];
  units: { id: number; label: string }[];
  /** `rate` as a string to calculate the final price in the form. */
  taxRates: { id: number; label: string; rate: string }[];
};

/**
 * Options for the selects. Inactive tax rates are not offered, except the one
 * the product already has (otherwise editing it would silently lose it).
 */
export async function getProductFormOptions(
  currentTaxRateId?: number,
): Promise<ProductFormOptions> {
  const [categories, units, taxRates] = await Promise.all([
    db.category.findMany({ select: { id: true, name: true, parentId: true } }),
    db.measurementUnit.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, description: true },
    }),
    db.taxRate.findMany({
      where: { OR: [{ isActive: true }, { id: currentTaxRateId ?? -1 }] },
      orderBy: [{ rate: "desc" }, { name: "asc" }],
      select: { id: true, name: true, rate: true },
    }),
  ]);

  return {
    categories: flattenCategoryTree(categories)
      .filter((node) => node.childCount === 0)
      .map((node) => ({ id: node.id, label: node.path.join(" › ") })),
    units: units.map((unit) => ({
      id: unit.id,
      label: unit.description
        ? `${unit.name} (${unit.description})`
        : unit.name,
    })),
    taxRates: taxRates.map((taxRate) => ({
      id: taxRate.id,
      label: taxRate.name,
      rate: taxRate.rate.toString(),
    })),
  };
}
