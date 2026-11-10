import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { CartLine } from "./cart";
import { customerPrice, saleDiscount } from "./customer-price";
import { db } from "./db";
import { getPricing } from "./pricing-queries";

const CART_ITEM_INCLUDE = {
  product: {
    select: {
      name: true,
      sku: true,
      price: true,
      weight: true,
      volume: true,
      isActive: true,
      deletedAt: true,
      taxRate: { select: { rate: true } },
      measurementUnit: { select: { name: true, allowsDecimals: true } },
    },
  },
} satisfies Prisma.CartItemInclude;

export type CartItemRow = Prisma.CartItemGetPayload<{
  include: typeof CART_ITEM_INCLUDE;
}> & {
  /** Customer's net price (their list and their discount). */
  price: string;
};

/**
 * A person's cart with their company's prices, split into what
 * can be ordered and what cannot: a product paused or deleted after
 * being added does not go into the order. Accepts a transaction to read it inside
 * the confirmation.
 */
export async function getCart(
  personId: string,
  customerId: string | null,
  client: Pick<typeof db, "cartItem" | "customer" | "priceListItem"> = db,
) {
  const rows = await client.cartItem.findMany({
    where: { personId },
    orderBy: { createdAt: "asc" },
    include: CART_ITEM_INCLUDE,
  });
  const pricing = await getPricing(
    customerId,
    rows.map((row) => row.productId),
    client,
  );
  const items: CartItemRow[] = rows.map((row) => ({
    ...row,
    price: customerPrice(row.productId, row.product.price, pricing),
  }));
  const available = items.filter(
    (item) => item.product.isActive && !item.product.deletedAt,
  );
  const unavailable = items.filter((item) => !available.includes(item));
  return { items, available, unavailable };
}

/** What `lineTotals` / `cartTotals` need. */
export function toCartLine(item: CartItemRow): CartLine {
  return {
    price: item.price,
    rate: item.product.taxRate.rate,
    quantity: item.quantity,
    weight: item.product.weight,
  };
}

/** Net discount of the lines: base price against the customer's. */
export function cartDiscount(items: CartItemRow[]): string {
  return saleDiscount(
    items.map((item) => ({
      listPrice: item.product.price,
      price: item.price,
      quantity: item.quantity,
    })),
  );
}

/** What `cartFingerprint` needs. */
export function toFingerprintLine(item: CartItemRow) {
  return {
    productId: item.productId,
    quantity: item.quantity,
    price: item.price,
    rate: item.product.taxRate.rate,
  };
}
