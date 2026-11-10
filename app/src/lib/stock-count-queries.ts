import "server-only";
import { db } from "./db";

export type CountItemRow = {
  productId: string;
  name: string;
  sku: string;
  unit: string;
  counted: string;
  /** System balance when the product was first counted. */
  expected: string;
  /** Difference recorded on approval (null while it is open). */
  applied: string | null;
};

export type CountDetail = {
  id: string;
  number: number;
  state: "OPEN" | "APPROVED" | "CANCELED";
  warehouseName: string;
  notes: string | null;
  createdAt: Date;
  approvedAt: Date | null;
  items: CountItemRow[];
};

/** A count with what was counted, from the last product loaded to the first. */
export async function getStockCount(
  number: number,
): Promise<CountDetail | null> {
  const count = await db.stockCount.findUnique({
    where: { number },
    include: {
      warehouse: { select: { name: true } },
      items: {
        include: {
          product: {
            select: {
              name: true,
              sku: true,
              measurementUnit: { select: { name: true } },
            },
          },
        },
      },
    },
  });
  if (!count) return null;
  return {
    id: count.id,
    number: count.number,
    state: count.state,
    warehouseName: count.warehouse.name,
    notes: count.notes,
    createdAt: count.createdAt,
    approvedAt: count.approvedAt,
    items: count.items
      .map((item) => ({
        productId: item.productId,
        name: item.product.name,
        sku: item.product.sku,
        unit: item.product.measurementUnit.name,
        counted: item.counted.toString(),
        expected: item.expected.toString(),
        applied: item.applied === null ? null : item.applied.toString(),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "es")),
  };
}
