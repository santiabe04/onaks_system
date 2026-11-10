import "server-only";
import { BASE_PRICING, type Pricing } from "./customer-price";
import { db } from "./db";

/**
 * A customer's list and discount, with the fixed prices of their list for
 * those products. No customer (an admin looking at the shop): base price.
 * Accepts a transaction to calculate inside the confirmation.
 */
export async function getPricing(
  customerId: string | null,
  productIds: string[],
  client: Pick<typeof db, "customer" | "priceListItem"> = db,
): Promise<Pricing> {
  if (!customerId) return BASE_PRICING;
  const customer = await client.customer.findUnique({
    where: { id: customerId },
    select: {
      discountRate: true,
      priceListId: true,
      priceList: { select: { adjustment: true } },
    },
  });
  if (!customer) return BASE_PRICING;
  const items =
    customer.priceListId && productIds.length > 0
      ? await client.priceListItem.findMany({
          where: {
            priceListId: customer.priceListId,
            productId: { in: productIds },
          },
          select: { productId: true, price: true },
        })
      : [];
  return {
    adjustment: customer.priceList?.adjustment.toString() ?? "0",
    discount: customer.discountRate.toString(),
    overrides: Object.fromEntries(
      items.map((item) => [item.productId, item.price.toString()]),
    ),
  };
}
