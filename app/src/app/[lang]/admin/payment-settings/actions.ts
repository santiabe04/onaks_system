"use server";

import { revalidatePath } from "next/cache";
import { getActionDictionary } from "@/i18n/dictionary";
import { audit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  validateTransferSettingsForm,
  type TransferSettingsFormState,
} from "@/lib/transfer";

// Los datos de cobro son una sola fila (id 1): guardar crea o reemplaza.

/** Guarda los datos de cobro por transferencia y los audita (antes y después). */
export async function saveTransferSettings(
  _prev: TransferSettingsFormState,
  formData: FormData,
): Promise<TransferSettingsFormState> {
  const user = await requirePermission("payment-settings:manage");

  const result = validateTransferSettingsForm(
    formData,
    getActionDictionary().paymentSettings.errors,
  );
  if (!result.ok) return result.state;

  await db.$transaction(async (tx) => {
    const before = await tx.transferSettings.findUnique({ where: { id: 1 } });
    const after = await tx.transferSettings.upsert({
      where: { id: 1 },
      create: { id: 1, ...result.data, updatedById: user.id },
      update: { ...result.data, updatedById: user.id },
    });
    await audit(tx, {
      action: before ? "UPDATE" : "CREATE",
      actorUserId: user.id,
      entityType: "TRANSFER_SETTINGS",
      entityId: 1,
      before: before ?? undefined,
      after,
    });
  });

  // Checkout y detalle de pedidos muestran estos datos.
  revalidatePath("/[lang]", "layout");
  return { savedAt: Date.now(), values: result.values };
}
