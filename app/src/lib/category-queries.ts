import "server-only";
import type { CategoryRow } from "./category";
import { db } from "./db";

/** The full tree and which categories have (current) products. */
export async function getCategoryTreeData(): Promise<{
  rows: CategoryRow[];
  withProducts: Set<number>;
}> {
  const [rows, used] = await Promise.all([
    db.category.findMany({ select: { id: true, name: true, parentId: true } }),
    db.product.groupBy({ by: ["categoryId"], where: { deletedAt: null } }),
  ]);
  return { rows, withProducts: new Set(used.map((row) => row.categoryId)) };
}
