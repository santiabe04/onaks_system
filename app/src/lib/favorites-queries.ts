import "server-only";
import { db } from "./db";

/** The company's favorites (product ids). Without a company, none. */
export async function getFavoriteIds(
  customerId: string | null,
): Promise<Set<string>> {
  if (!customerId) return new Set();
  const rows = await db.customerFavorite.findMany({
    where: { customerId },
    select: { productId: true },
  });
  return new Set(rows.map((row) => row.productId));
}

/**
 * The products the company ordered most, from the one with the most orders to the
 * one with the fewest (on a tie, the most recent order and then the name, so the
 * order is stable), not counting canceled ones or ones that cannot be ordered today
 */
export async function getMostOrderedIds(
  customerId: string,
  limit: number,
): Promise<string[]> {
  const rows = await db.$queryRaw<{ productId: string }[]>`
    SELECT i."product_id" AS "productId"
    FROM "sale_items" i
    JOIN "sales" s ON s."id" = i."sale_id"
    JOIN "customer_addresses" a ON a."id" = s."address_id"
    JOIN "products" p ON p."id" = i."product_id"
    WHERE a."customer_id" = ${customerId}
      AND s."state" <> 'CANCELED'
      AND p."is_active" = true AND p."deleted_at" IS NULL
    GROUP BY i."product_id"
    ORDER BY COUNT(DISTINCT s."id") DESC, MAX(s."created_at") DESC,
             MIN(p."name"), i."product_id"
    LIMIT ${limit}`;
  return rows.map((row) => row.productId);
}
