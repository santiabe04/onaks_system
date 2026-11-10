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
 * Records the return of a delivered order (see `createReturn`): creates the
 * credit note, moves the stock and lowers the customer's debt.
 */
export async function registerReturn(
  saleId: string,
  _prev: ReturnFormState,
  formData: FormData,
): Promise<ReturnFormState> {
  const user = await requirePermission("sales:manage");
  const t = getActionDictionary().customerCreditNotes.errors;
  if (!isCuid(saleId)) return { error: t.notFound };

  // To validate the form; `createReturn` checks it again with the account locked.
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

  // Order detail, customer account, stock, debtors and "My orders".
  revalidatePath("/[lang]", "layout");
  redirect(`/admin/orders/${number}`);
}
