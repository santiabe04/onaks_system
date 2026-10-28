"use server";

import { revalidatePath } from "next/cache";
import { getActionDictionary } from "@/i18n/dictionary";
import { requirePermission } from "@/lib/auth";
import { parseCartQuantity } from "@/lib/cart";
import { VISIBLE_PRODUCT } from "@/lib/catalog";
import { db } from "@/lib/db";
import { isCuid } from "@/lib/ids";

// Solo los clientes compran (permiso `sales:create`): el admin ve el catálogo
// pero no tiene carrito. El carrito no va a la auditoría: no es un dato del
// negocio hasta que se confirma como pedido.
const PERMISSION = "sales:create";

export type CartActionState = { error?: string; savedAt?: number };

function messages() {
  return getActionDictionary().cart.errors;
}

function revalidateCart() {
  // El layout de la tienda muestra la cantidad en el header.
  revalidatePath("/[lang]", "layout");
}

/** Producto que se puede comprar, con lo que hace falta para validar la cantidad. */
async function findBuyable(productId: string) {
  if (!isCuid(productId)) return null;
  return db.product.findFirst({
    where: { id: productId, ...VISIBLE_PRODUCT },
    select: { measurementUnit: { select: { allowsDecimals: true } } },
  });
}

function readQuantity(formData: FormData, allowsDecimals: boolean) {
  const raw = formData.get("quantity");
  return parseCartQuantity(typeof raw === "string" ? raw : "", allowsDecimals);
}

/** Suma la cantidad al carrito (si el producto ya estaba, se acumula). */
export async function addToCart(
  productId: string,
  _prev: CartActionState,
  formData: FormData,
): Promise<CartActionState> {
  const user = await requirePermission(PERMISSION);
  const t = messages();

  const product = await findBuyable(productId);
  if (!product) return { error: t.unavailable };
  const quantity = readQuantity(
    formData,
    product.measurementUnit.allowsDecimals,
  );
  if (!quantity) {
    return {
      error: product.measurementUnit.allowsDecimals
        ? t.quantityDecimal
        : t.quantityInteger,
    };
  }

  await db.cartItem.upsert({
    where: { personId_productId: { personId: user.personId, productId } },
    create: { personId: user.personId, productId, quantity },
    update: { quantity: { increment: quantity } },
  });
  revalidateCart();
  return { savedAt: Date.now() };
}

/** Reemplaza la cantidad (desde el carrito). */
export async function updateCartItem(
  productId: string,
  _prev: CartActionState,
  formData: FormData,
): Promise<CartActionState> {
  const user = await requirePermission(PERMISSION);
  const t = messages();

  const product = await findBuyable(productId);
  if (!product) return { error: t.unavailable };
  const quantity = readQuantity(
    formData,
    product.measurementUnit.allowsDecimals,
  );
  if (!quantity) {
    return {
      error: product.measurementUnit.allowsDecimals
        ? t.quantityDecimal
        : t.quantityInteger,
    };
  }

  await db.cartItem.updateMany({
    where: { personId: user.personId, productId },
    data: { quantity },
  });
  revalidateCart();
  return { savedAt: Date.now() };
}

export async function removeCartItem(
  productId: string,
): Promise<CartActionState> {
  const user = await requirePermission(PERMISSION);
  if (!isCuid(productId)) return { error: messages().unavailable };

  await db.cartItem.deleteMany({
    where: { personId: user.personId, productId },
  });
  revalidateCart();
  return {};
}
