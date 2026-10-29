"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getActionDictionary } from "@/i18n/dictionary";
import { audit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { isCuid } from "@/lib/ids";
import { normalizeLocation } from "@/lib/picking";
import { validateMovementForm, type MovementFormState } from "@/lib/stock";
import { recordMovement, StockLedgerError } from "@/lib/stock-ledger";

// La acción verifica el permiso antes que nada: se puede invocar con un POST
// directo, sin pasar por la página ni por el proxy.
const PERMISSION = "stock:manage";

export async function createMovement(
  _prev: MovementFormState,
  formData: FormData,
): Promise<MovementFormState> {
  const user = await requirePermission(PERMISSION);
  const t = getActionDictionary().stock.errors;

  const result = validateMovementForm(formData, t);
  if (!result.ok) return result.state;

  try {
    await db.$transaction((tx) => recordMovement(tx, result.data, user.id));
  } catch (error) {
    if (!(error instanceof StockLedgerError)) throw error;
    const field =
      error.code === "productNotFound"
        ? "productId"
        : error.code === "warehouseInactive"
          ? "warehouseId"
          : "quantity";
    return { errors: { [field]: [t[error.code]] }, values: result.values };
  }

  // Cambian el stock de la lista de productos, la de stock y la del producto.
  revalidatePath("/[lang]/admin/stock", "layout");
  revalidatePath("/[lang]/admin/products", "page");
  redirect(`/admin/stock/${result.data.productId}`);
}

export type LocationState = { error?: string; savedAt?: number };

/**
 * Ubicación del producto en un depósito (ordena el picking). Si todavía no
 * tiene saldo ahí, se crea en 0: el saldo solo lo mueve el libro de stock.
 */
export async function setProductLocation(
  productId: string,
  warehouseId: string,
  _prev: LocationState,
  formData: FormData,
): Promise<LocationState> {
  const user = await requirePermission(PERMISSION);
  const t = getActionDictionary().stock.errors;
  const raw = formData.get("location");
  const location = normalizeLocation(typeof raw === "string" ? raw : "");
  if (location === null) return { error: t.location };
  const [product, warehouse] =
    isCuid(productId) && isCuid(warehouseId)
      ? await Promise.all([
          db.product.findFirst({
            where: { id: productId, deletedAt: null },
            select: { id: true },
          }),
          db.warehouse.findUnique({
            where: { id: warehouseId },
            select: { id: true },
          }),
        ])
      : [null, null];
  if (!product) return { error: t.productNotFound };
  if (!warehouse) return { error: t.warehouseRequired };

  await db.$transaction(async (tx) => {
    const key = { productId, warehouseId };
    const before = await tx.productStock.findUnique({
      where: { productId_warehouseId: key },
      select: { location: true },
    });
    const after = await tx.productStock.upsert({
      where: { productId_warehouseId: key },
      create: { ...key, location: location || null },
      update: { location: location || null },
      select: { location: true },
    });
    await audit(tx, {
      action: before ? "UPDATE" : "CREATE",
      actorUserId: user.id,
      entityType: "PRODUCT_LOCATION",
      entityId: `${productId}:${warehouseId}`,
      before: before ?? undefined,
      after,
    });
  });
  revalidatePath("/[lang]/admin/stock", "layout");
  return { savedAt: Date.now() };
}
