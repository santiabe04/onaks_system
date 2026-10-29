import "server-only";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { toCents } from "./account";
import { audit } from "./audit";
import { isoDay } from "./order-period";
import { type Allocation, summarizeSupplierAccount } from "./supplier-account";

type Client = PrismaClient | Prisma.TransactionClient;

/**
 * Bloquea al proveedor hasta el fin de la transacción: todo lo que mueve su
 * cuenta (OP, notas de crédito, imputaciones, anular facturas) pasa de a uno.
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

/** La cuenta de un proveedor: sus comprobantes y el resumen (`summarizeSupplierAccount`). */
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

/** Facturas con saldo, de la más vieja a la más nueva (para imputar). */
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

/** Guarda las imputaciones de una OP o una nota de crédito, auditadas en el comprobante. */
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
