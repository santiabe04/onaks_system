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

// The payment details are a single row (id 1): saving creates or replaces it.

/** Saves the transfer payment details and audits them (before and after). */
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

  // Checkout and order detail show this data.
  revalidatePath("/[lang]", "layout");
  return { savedAt: Date.now(), values: result.values };
}
