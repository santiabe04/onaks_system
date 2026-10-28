import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { CartLine } from "./cart";
import { db } from "./db";

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
}>;

/**
 * El carrito de una persona, separado en lo que se puede pedir y lo que no:
 * un producto pausado o borrado después de agregarlo no entra en el pedido.
 * Acepta una transacción para leerlo dentro de la confirmación.
 */
export async function getCart(
  personId: string,
  client: Pick<typeof db, "cartItem"> = db,
) {
  const items = await client.cartItem.findMany({
    where: { personId },
    orderBy: { createdAt: "asc" },
    include: CART_ITEM_INCLUDE,
  });
  const available = items.filter(
    (item) => item.product.isActive && !item.product.deletedAt,
  );
  const unavailable = items.filter((item) => !available.includes(item));
  return { items, available, unavailable };
}

/** Lo que necesitan `lineTotals` / `cartTotals`. */
export function toCartLine(item: CartItemRow): CartLine {
  return {
    price: item.product.price,
    rate: item.product.taxRate.rate,
    quantity: item.quantity,
    weight: item.product.weight,
  };
}

/** Lo que necesita `cartFingerprint`. */
export function toFingerprintLine(item: CartItemRow) {
  return {
    productId: item.productId,
    quantity: item.quantity,
    price: item.product.price,
    rate: item.product.taxRate.rate,
  };
}
