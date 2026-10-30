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
  /** Precio neto del cliente (su lista y su descuento). */
  price: string;
};

/**
 * El carrito de una persona con los precios de su empresa, separado en lo que
 * se puede pedir y lo que no: un producto pausado o borrado después de
 * agregarlo no entra en el pedido. Acepta una transacción para leerlo dentro
 * de la confirmación.
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

/** Lo que necesitan `lineTotals` / `cartTotals`. */
export function toCartLine(item: CartItemRow): CartLine {
  return {
    price: item.price,
    rate: item.product.taxRate.rate,
    quantity: item.quantity,
    weight: item.product.weight,
  };
}

/** Bonificación neta de las líneas: precio base contra el del cliente. */
export function cartDiscount(items: CartItemRow[]): string {
  return saleDiscount(
    items.map((item) => ({
      listPrice: item.product.price,
      price: item.price,
      quantity: item.quantity,
    })),
  );
}

/** Lo que necesita `cartFingerprint`. */
export function toFingerprintLine(item: CartItemRow) {
  return {
    productId: item.productId,
    quantity: item.quantity,
    price: item.price,
    rate: item.product.taxRate.rate,
  };
}
