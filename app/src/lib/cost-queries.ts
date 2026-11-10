import "server-only";
import { db } from "./db";

/**
 * Last purchase cost (net) of each product: the most recent among its
 * suppliers. Products with no cost loaded do not appear. Accepts a
 * transaction to take the snapshot when the order is created.
 */
export async function latestCosts(
  productIds: string[],
  client: Pick<typeof db, "supplierProduct"> = db,
): Promise<Record<string, string>> {
  if (productIds.length === 0) return {};
  const rows = await client.supplierProduct.findMany({
    where: { productId: { in: productIds }, lastCost: { not: null } },
    orderBy: [
      { lastCostAt: { sort: "desc", nulls: "last" } },
      { updatedAt: "desc" },
    ],
    select: { productId: true, lastCost: true },
  });
  const costs: Record<string, string> = {};
  for (const row of rows) {
    // Sorted from newest to oldest, so each product's first one is kept.
    costs[row.productId] ??= row.lastCost!.toString();
  }
  return costs;
}
