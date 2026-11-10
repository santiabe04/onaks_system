import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { summarizeAccount } from "./account";
import { audit } from "./audit";
import { db } from "./db";

type Client = Prisma.TransactionClient | typeof db;

/** A customer's orders, payments and credit notes, with the account summary. */
export async function loadAccount(client: Client, customerId: string) {
  const [sales, payments, creditNotes] = await Promise.all([
    client.sale.findMany({
      where: { address: { customerId } },
      orderBy: { number: "asc" },
      select: {
        id: true,
        number: true,
        state: true,
        total: true,
        createdAt: true,
        paymentState: true,
        paidAt: true,
        deliveredAt: true,
      },
    }),
    client.customerPayment.findMany({
      where: { customerId },
      orderBy: [{ paidOn: "asc" }, { createdAt: "asc" }],
      include: {
        createdBy: {
          select: { person: { select: { name: true, surname: true } } },
        },
        voidedBy: {
          select: { person: { select: { name: true, surname: true } } },
        },
        sale: { select: { number: true } },
      },
    }),
    client.customerCreditNote.findMany({
      where: { customerId },
      orderBy: { number: "asc" },
      include: {
        sale: { select: { number: true } },
        createdBy: {
          select: { person: { select: { name: true, surname: true } } },
        },
        voidedBy: {
          select: { person: { select: { name: true, surname: true } } },
        },
        items: {
          include: {
            product: {
              select: {
                name: true,
                measurementUnit: { select: { name: true } },
              },
            },
          },
        },
      },
    }),
  ]);
  const summary = summarizeAccount(
    sales,
    payments.map((payment) => ({
      kind: payment.kind,
      amount: payment.amount,
      voided: payment.voidedAt !== null,
    })),
    creditNotes.map((note) => ({
      amount: note.amount,
      voided: note.voidedAt !== null,
    })),
  );
  return { sales, payments, creditNotes, summary };
}

/**
 * Locks the customer's account until the end of the transaction: payments,
 * voids and status changes for the same customer are done one at a time, so
 * the balance that is validated is the one that remains.
 */
export async function lockAccount(
  tx: Prisma.TransactionClient,
  customerId: string,
): Promise<boolean> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "customers" WHERE "id" = ${customerId} FOR UPDATE`;
  return rows.length > 0;
}

/**
 * Recalculates the payment status of the customer's orders (allocation to the
 * oldest) and saves it in `sales`, so the lists and filters use it directly.
 * `paid_at` is when it became paid; it is cleared if it stops being paid.
 */
export async function recomputeAccount(
  tx: Prisma.TransactionClient,
  customerId: string,
) {
  const account = await loadAccount(tx, customerId);
  for (const sale of account.sales) {
    const allocation = account.summary.sales[sale.id];
    // Canceled orders receive no allocation: they stay as they were.
    if (!allocation) continue;
    const paidAt =
      allocation.paymentState === "PAID" ? (sale.paidAt ?? new Date()) : null;
    if (
      allocation.paymentState !== sale.paymentState ||
      paidAt?.getTime() !== sale.paidAt?.getTime()
    ) {
      await tx.sale.update({
        where: { id: sale.id },
        data: { paymentState: allocation.paymentState, paidAt },
      });
    }
  }
  return account;
}

/**
 * Records a payment or refund (already validated) with audit and recalculates the
 * account. The account must be locked (`lockAccount`) by the caller.
 * Used by the customer account, the order detail and the stop loading.
 */
export async function createCustomerPayment(
  tx: Prisma.TransactionClient,
  input: {
    customerId: string;
    saleId: string | null;
    kind: "PAYMENT" | "REFUND";
    amount: string;
    method: "CASH" | "TRANSFER" | "CARD";
    /** YYYY-MM-DD. */
    paidOn: string;
    notes: string | null;
  },
  userId: string,
) {
  const payment = await tx.customerPayment.create({
    data: {
      customerId: input.customerId,
      saleId: input.saleId,
      kind: input.kind,
      amount: input.amount,
      method: input.method,
      paidOn: new Date(`${input.paidOn}T00:00:00Z`),
      notes: input.notes,
      createdById: userId,
    },
  });
  await audit(tx, {
    action: "CREATE",
    actorUserId: userId,
    entityType: "CUSTOMER_PAYMENT",
    entityId: payment.id,
    after: payment,
  });
  await recomputeAccount(tx, input.customerId);
  return payment;
}
