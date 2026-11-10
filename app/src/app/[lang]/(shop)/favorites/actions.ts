"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth";
import { VISIBLE_PRODUCT } from "@/lib/catalog";
import { db } from "@/lib/db";
import { isCuid } from "@/lib/ids";

// Company favorites: shared by all its people. Only those who buy
// have `sales:create`. Like the cart, it is a preference and does not go to the
// audit log.
const PERMISSION = "sales:create";

/** Marks or unmarks a product as a favorite of the user's company. */
export async function setFavorite(
  productId: string,
  favorite: boolean,
): Promise<void> {
  const user = await requirePermission(PERMISSION);
  const customerId = user.customerId;
  if (!customerId || !isCuid(productId)) return;

  if (favorite) {
    // Only what can be bought is added; removing is always possible.
    const product = await db.product.findFirst({
      where: { id: productId, ...VISIBLE_PRODUCT },
      select: { id: true },
    });
    if (!product) return;
    await db.customerFavorite.upsert({
      where: { customerId_productId: { customerId, productId } },
      create: { customerId, productId },
      update: {},
    });
  } else {
    await db.customerFavorite.deleteMany({ where: { customerId, productId } });
  }
  revalidatePath("/[lang]", "layout");
}

export type AddFavoritesState = {
  /** How many products were added (those already in the cart are not counted). */
  added?: number;
  savedAt?: number;
};

/**
 * Adds one unit of each favorite not yet in the cart: what
 * the cart already had (with its quantity) is not touched.
 */
export async function addFavoritesToCart(): Promise<AddFavoritesState> {
  const user = await requirePermission(PERMISSION);
  const customerId = user.customerId;
  if (!customerId) return { added: 0, savedAt: Date.now() };

  const favorites = await db.customerFavorite.findMany({
    where: { customerId, product: VISIBLE_PRODUCT },
    select: { productId: true },
  });
  const { count } = await db.cartItem.createMany({
    data: favorites.map(({ productId }) => ({
      personId: user.personId,
      productId,
      quantity: "1",
    })),
    skipDuplicates: true,
  });
  revalidatePath("/[lang]", "layout");
  return { added: count, savedAt: Date.now() };
}
