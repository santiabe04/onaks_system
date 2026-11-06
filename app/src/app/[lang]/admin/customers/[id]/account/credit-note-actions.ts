"use server";

import { revalidatePath } from "next/cache";
import { getActionDictionary } from "@/i18n/dictionary";
import { requirePermission } from "@/lib/auth";
import { parseAdjustment } from "@/lib/customer-credit";
import {
  createAdjustment,
  CreditNoteError,
  voidCreditNote,
} from "@/lib/customer-credit-ledger";
import { db } from "@/lib/db";
import { isCuid } from "@/lib/ids";
import { validateVoidReason } from "@/lib/payment-form";
import { StockLedgerError } from "@/lib/stock-ledger";

// Notas de crédito por importe y anulaciones de cualquier nota. Mismo permiso
// que cobros y pedidos. Las devoluciones con productos se registran desde el
// pedido (`orders/[number]/return`).
const PERMISSION = "sales:manage";

export type CreditNoteFormState = { error?: string; savedAt?: number };

function revalidateAccount() {
  // Cuenta, detalle de pedidos, stock, deudores y "Mis pedidos".
  revalidatePath("/[lang]", "layout");
}

/** Nota de crédito por importe: baja lo que debe el cliente, sin mercadería. */
export async function registerAdjustment(
  customerId: string,
  _prev: CreditNoteFormState,
  formData: FormData,
): Promise<CreditNoteFormState> {
  const user = await requirePermission(PERMISSION);
  const t = getActionDictionary().customerCreditNotes.errors;
  if (!isCuid(customerId)) return { error: t.notFound };

  const parsed = parseAdjustment(formData, t);
  if (!parsed.ok) return { error: parsed.error };

  try {
    await db.$transaction((tx) =>
      createAdjustment(tx, customerId, parsed.data, user.id),
    );
  } catch (error) {
    if (error instanceof CreditNoteError) return { error: t[error.code] };
    throw error;
  }

  revalidateAccount();
  return { savedAt: Date.now() };
}

/** Anula una nota de crédito (devolución o ajuste): queda en el historial. */
export async function voidCustomerCreditNote(
  noteId: string,
  _prev: CreditNoteFormState,
  formData: FormData,
): Promise<CreditNoteFormState> {
  const user = await requirePermission(PERMISSION);
  const dictionary = getActionDictionary();
  const t = dictionary.customerCreditNotes.errors;
  if (!isCuid(noteId)) return { error: t.notFound };

  const reason = validateVoidReason(formData, dictionary.account.errors);
  if (!reason.ok) return { error: reason.error };

  try {
    await db.$transaction((tx) =>
      voidCreditNote(tx, noteId, reason.reason, user.id),
    );
  } catch (error) {
    if (error instanceof CreditNoteError) return { error: t[error.code] };
    if (error instanceof StockLedgerError)
      return { error: t.warehouseInactive };
    throw error;
  }

  revalidateAccount();
  return { savedAt: Date.now() };
}
