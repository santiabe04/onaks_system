"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Prisma } from "@/generated/prisma/client";
import { getActionDictionary } from "@/i18n/dictionary";
import { audit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { parseReason } from "@/lib/goods-receipt";
import { isCuid } from "@/lib/ids";
import {
  parseAllocations,
  parseCreditNoteAmounts,
  unallocatedOf,
} from "@/lib/supplier-account";
import {
  loadSupplierAccount,
  lockSupplier,
  openInvoices,
  writeAllocations,
} from "@/lib/supplier-account-ledger";
import { parseVoucher } from "@/lib/supplier-invoice";

// Notas de crédito de proveedores, por importe: bajan la deuda como un pago
// y se imputan a facturas (la asociada, si la hay, se precarga). Se anulan con
// motivo. Todo con el proveedor bloqueado.
const PERMISSION = "purchases:manage";
const ENTITY = "SUPPLIER_CREDIT_NOTE";

export type CreditNoteActionState = { error?: string };

/** Corta la transacción con un mensaje para el admin. */
class CreditNoteError extends Error {}

function messages() {
  return getActionDictionary().creditNotes.errors;
}

async function run(
  work: () => Promise<void>,
): Promise<CreditNoteActionState | null> {
  try {
    await work();
    return null;
  } catch (error) {
    if (error instanceof CreditNoteError) return { error: error.message };
    throw error;
  }
}

function revalidateAccounts() {
  revalidatePath("/[lang]/admin", "layout");
}

/** Bloquea al proveedor de la nota y después la nota; la devuelve. */
async function lockCreditNote(tx: Prisma.TransactionClient, noteId: string) {
  const t = messages();
  if (!isCuid(noteId)) throw new CreditNoteError(t.notFound);
  const found = await tx.supplierCreditNote.findUnique({
    where: { id: noteId },
    select: { supplierId: true },
  });
  if (!found) throw new CreditNoteError(t.notFound);
  await lockSupplier(tx, found.supplierId);
  await tx.$queryRaw`
    SELECT "id" FROM "supplier_credit_notes" WHERE "id" = ${noteId} FOR UPDATE`;
  const note = await tx.supplierCreditNote.findUniqueOrThrow({
    where: { id: noteId },
    include: { allocations: true },
  });
  if (note.annulledAt) throw new CreditNoteError(t.alreadyAnnulled);
  return note;
}

/** Nueva nota de crédito del proveedor, con su imputación. */
export async function createCreditNote(
  supplierId: string,
  _prev: CreditNoteActionState,
  formData: FormData,
): Promise<CreditNoteActionState> {
  const user = await requirePermission(PERMISSION);
  const t = messages();
  const voucher = parseVoucher(formData, t);
  if (!voucher.ok) return { error: voucher.error };
  const amounts = parseCreditNoteAmounts(formData, t);
  if (!amounts.ok) return { error: amounts.error };
  const rawInvoice = formData.get("invoiceId");
  const invoiceId = rawInvoice ? String(rawInvoice) : null;

  let noteId = "";
  const failed = await run(() =>
    db.$transaction(async (tx) => {
      if (!isCuid(supplierId) || !(await lockSupplier(tx, supplierId))) {
        throw new CreditNoteError(t.supplier);
      }
      const duplicate = await tx.supplierCreditNote.findFirst({
        where: {
          supplierId,
          type: voucher.data.type,
          pointOfSale: voucher.data.pointOfSale,
          number: voucher.data.number,
          annulledAt: null,
        },
        select: { id: true },
      });
      if (duplicate) throw new CreditNoteError(t.duplicate);
      if (invoiceId) {
        const invoice = isCuid(invoiceId)
          ? await tx.supplierInvoice.findFirst({
              where: { id: invoiceId, supplierId, state: { not: "ANNULLED" } },
              select: { id: true },
            })
          : null;
        if (!invoice) throw new CreditNoteError(t.invoice);
      }
      const account = await loadSupplierAccount(tx, supplierId);
      const allocations = parseAllocations(
        formData,
        openInvoices(account),
        amounts.data.total,
        t,
      );
      if (!allocations.ok) throw new CreditNoteError(allocations.error);

      const note = await tx.supplierCreditNote.create({
        data: {
          supplierId,
          invoiceId,
          ...voucher.data,
          issueDate: new Date(`${voucher.data.issueDate}T00:00:00Z`),
          ...amounts.data,
          createdById: user.id,
        },
      });
      await audit(tx, {
        action: "CREATE",
        actorUserId: user.id,
        entityType: ENTITY,
        entityId: note.id,
        after: note,
      });
      await writeAllocations(
        tx,
        { kind: ENTITY, id: note.id },
        allocations.allocations,
        user.id,
      );
      noteId = note.id;
    }),
  );
  if (failed) return failed;
  revalidateAccounts();
  redirect(`/admin/credit-notes/${noteId}`);
}

/** Imputa lo que quedó sin imputar de la nota a facturas con saldo. */
export async function allocateCreditNote(
  noteId: string,
  _prev: CreditNoteActionState,
  formData: FormData,
): Promise<CreditNoteActionState> {
  const user = await requirePermission(PERMISSION);
  const t = messages();
  const failed = await run(() =>
    db.$transaction(async (tx) => {
      const note = await lockCreditNote(tx, noteId);
      const available = unallocatedOf({
        total: note.total,
        annulled: false,
        allocations: note.allocations,
      });
      if (available === "0.00") {
        throw new CreditNoteError(t.nothingToAllocate);
      }
      const account = await loadSupplierAccount(tx, note.supplierId);
      const allocations = parseAllocations(
        formData,
        openInvoices(account),
        available,
        t,
      );
      if (!allocations.ok) throw new CreditNoteError(allocations.error);
      await writeAllocations(
        tx,
        { kind: ENTITY, id: note.id },
        allocations.allocations,
        user.id,
      );
    }),
  );
  if (failed) return failed;
  revalidateAccounts();
  return {};
}

/** Anula una nota de crédito: el crédito y sus imputaciones dejan de contar. */
export async function annulCreditNote(
  noteId: string,
  _prev: CreditNoteActionState,
  formData: FormData,
): Promise<CreditNoteActionState> {
  const user = await requirePermission(PERMISSION);
  const t = messages();
  const reason = parseReason(formData, t);
  if (!reason.ok) return { error: reason.error };

  const failed = await run(() =>
    db.$transaction(async (tx) => {
      const note = await lockCreditNote(tx, noteId);
      const after = await tx.supplierCreditNote.update({
        where: { id: note.id },
        data: {
          annulledAt: new Date(),
          annulReason: reason.reason,
          annulledById: user.id,
        },
      });
      await audit(tx, {
        action: "UPDATE",
        actorUserId: user.id,
        entityType: ENTITY,
        entityId: note.id,
        before: { annulledAt: null },
        after: { annulledAt: after.annulledAt, annulReason: after.annulReason },
      });
    }),
  );
  if (failed) return failed;
  revalidateAccounts();
  return {};
}
