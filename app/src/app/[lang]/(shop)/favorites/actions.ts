"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth";
import { VISIBLE_PRODUCT } from "@/lib/catalog";
import { db } from "@/lib/db";
import { isCuid } from "@/lib/ids";

// Favoritos de la empresa: los comparten todas sus personas. Solo compra quien
// tiene `sales:create`. Como el carrito, es una preferencia y no va a la
// auditoría.
const PERMISSION = "sales:create";

/** Marca o desmarca un producto como favorito de la empresa del usuario. */
export async function setFavorite(
  productId: string,
  favorite: boolean,
): Promise<void> {
  const user = await requirePermission(PERMISSION);
  const customerId = user.customerId;
  if (!customerId || !isCuid(productId)) return;

  if (favorite) {
    // Solo se agrega lo que se puede comprar; quitar siempre se puede.
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
  /** Cuántos productos se sumaron (los que ya estaban en el carrito no). */
  added?: number;
  savedAt?: number;
};

/**
 * Suma al carrito una unidad de cada favorito que todavía no esté en él: lo
 * que ya tenía el carrito (con su cantidad) no se toca.
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
