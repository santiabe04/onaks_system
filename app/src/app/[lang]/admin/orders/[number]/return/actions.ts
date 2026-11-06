"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getActionDictionary } from "@/i18n/dictionary";
import { requirePermission } from "@/lib/auth";
import { parseReturn } from "@/lib/customer-credit";
import { createReturn, CreditNoteError } from "@/lib/customer-credit-ledger";
import { returnableLines } from "@/lib/customer-credit-queries";
import { db } from "@/lib/db";
import { isCuid } from "@/lib/ids";
import { StockLedgerError } from "@/lib/stock-ledger";

export type ReturnFormState = { error?: string };

/**
 * Registra la devolución de un pedido entregado (ver `createReturn`): crea la
 * nota de crédito, mueve el stock y baja la deuda del cliente.
 */
export async function registerReturn(
  saleId: string,
  _prev: ReturnFormState,
  formData: FormData,
): Promise<ReturnFormState> {
  const user = await requirePermission("sales:manage");
  const t = getActionDictionary().customerCreditNotes.errors;
  if (!isCuid(saleId)) return { error: t.notFound };

  // Para validar el form; `createReturn` lo vuelve a controlar con la cuenta bloqueada.
  const sale = await returnableLines(db, saleId);
  if (!sale) return { error: t.notFound };
  const parsed = parseReturn(formData, sale.lines, t);
  if (!parsed.ok) return { error: parsed.error };

  let number: number;
  try {
    number = await db.$transaction(async (tx) => {
      await createReturn(tx, saleId, parsed.data, user.id);
      return sale.number;
    });
  } catch (error) {
    if (error instanceof CreditNoteError) return { error: t[error.code] };
    if (error instanceof StockLedgerError)
      return { error: t.warehouseInactive };
    throw error;
  }

  // Detalle del pedido, cuenta corriente, stock, deudores y "Mis pedidos".
  revalidatePath("/[lang]", "layout");
  redirect(`/admin/orders/${number}`);
}
