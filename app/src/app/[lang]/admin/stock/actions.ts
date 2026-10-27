"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getActionDictionary } from "@/i18n/dictionary";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
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
