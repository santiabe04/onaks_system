import "server-only";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { toCents } from "./account";
import { audit } from "./audit";
import { isoDay } from "./order-period";
import { type Allocation, summarizeSupplierAccount } from "./supplier-account";

type Client = PrismaClient | Prisma.TransactionClient;

/**
 * Locks the supplier until the end of the transaction: everything that moves its
 * account (PO, credit notes, allocations, voiding invoices) goes one at a time.
 */
export async function lockSupplier(
  tx: Prisma.TransactionClient,
  supplierId: unknown,
): Promise<boolean> {
  if (typeof supplierId !== "string") return false;
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "suppliers" WHERE "id" = ${supplierId} FOR UPDATE`;
  return rows.length > 0;
}

const allocationSelect = {
  id: true,
  invoiceId: true,
  amount: true,
  createdAt: true,
} as const;

/** A supplier's account: its vouchers and the summary (`summarizeSupplierAccount`). */
export async function loadSupplierAccount(
  client: Client,
  supplierId: string,
  now: Date = new Date(),
) {
  const [invoices, payments, creditNotes] = await Promise.all([
    client.supplierInvoice.findMany({
      where: { supplierId },
      orderBy: [{ issueDate: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        type: true,
        pointOfSale: true,
        number: true,
        issueDate: true,
        dueDate: true,
        total: true,
        state: true,
        createdAt: true,
        purchaseOrder: { select: { number: true } },
      },
    }),
    client.supplierPayment.findMany({
      where: { supplierId },
      orderBy: [{ paidOn: "asc" }, { number: "asc" }],
      select: {
        id: true,
        number: true,
        paidOn: true,
        total: true,
        annulledAt: true,
        annulReason: true,
        createdAt: true,
        lines: { select: { method: true } },
        allocations: { select: allocationSelect },
      },
    }),
    client.supplierCreditNote.findMany({
      where: { supplierId },
      orderBy: [{ issueDate: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        type: true,
        pointOfSale: true,
        number: true,
        issueDate: true,
        total: true,
        annulledAt: true,
        annulReason: true,
        createdAt: true,
        allocations: { select: allocationSelect },
      },
    }),
  ]);
  const day = (date: Date) => date.toISOString().slice(0, 10);
  const summary = summarizeSupplierAccount(
    {
      invoices: invoices.map((invoice) => ({
        id: invoice.id,
        state: invoice.state,
        total: invoice.total,
        issueDate: day(invoice.issueDate),
        dueDate: invoice.dueDate ? day(invoice.dueDate) : null,
      })),
      payments: payments.map((payment) => ({
        total: payment.total,
        annulled: payment.annulledAt !== null,
        allocations: payment.allocations,
      })),
      creditNotes: creditNotes.map((note) => ({
        total: note.total,
        annulled: note.annulledAt !== null,
        allocations: note.allocations,
      })),
    },
    isoDay(now),
  );
  return { invoices, payments, creditNotes, summary };
}

/** Invoices with a balance, from the oldest to the newest (to allocate). */
export function openInvoices(
  account: Awaited<ReturnType<typeof loadSupplierAccount>>,
) {
  return account.summary.invoices
    .filter((balance) => toCents(balance.outstanding) > BigInt(0))
    .map((balance) => ({
      ...balance,
      invoice: account.invoices.find((invoice) => invoice.id === balance.id)!,
    }))
    .sort((a, b) => a.dueOn.localeCompare(b.dueOn));
}

/** Saves the allocations of a PO or a credit note, audited on the voucher. */
export async function writeAllocations(
  tx: Prisma.TransactionClient,
  document:
    | { kind: "SUPPLIER_PAYMENT"; id: string }
    | { kind: "SUPPLIER_CREDIT_NOTE"; id: string },
  allocations: Allocation[],
  userId: string,
): Promise<void> {
  if (allocations.length === 0) return;
  const link =
    document.kind === "SUPPLIER_PAYMENT"
      ? { paymentId: document.id }
      : { creditNoteId: document.id };
  await tx.supplierAllocation.createMany({
    data: allocations.map((allocation) => ({
      ...link,
      invoiceId: allocation.invoiceId,
      amount: allocation.amount,
      createdById: userId,
    })),
  });
  await audit(tx, {
    action: "UPDATE",
    actorUserId: userId,
    entityType: document.kind,
    entityId: document.id,
    after: { allocations },
  });
}
