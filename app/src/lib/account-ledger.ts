import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { summarizeAccount } from "./account";
import { db } from "./db";

type Client = Prisma.TransactionClient | typeof db;

/** Pedidos y cobros de un cliente, con el resumen de la cuenta. */
export async function loadAccount(client: Client, customerId: string) {
  const [sales, payments] = await Promise.all([
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
  ]);
  const summary = summarizeAccount(
    sales,
    payments.map((payment) => ({
      kind: payment.kind,
      amount: payment.amount,
      voided: payment.voidedAt !== null,
    })),
  );
  return { sales, payments, summary };
}

/**
 * Bloquea la cuenta del cliente hasta el fin de la transacción: cobros,
 * anulaciones y cambios de estado del mismo cliente se hacen de a uno, así
 * el saldo que se valida es el que queda.
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
 * Recalcula el estado de pago de los pedidos del cliente (imputación al más
 * viejo) y lo guarda en `sales`, así las listas y filtros lo usan directo.
 * `paid_at` es cuándo quedó pagado; se borra si deja de estarlo.
 */
export async function recomputeAccount(
  tx: Prisma.TransactionClient,
  customerId: string,
) {
  const account = await loadAccount(tx, customerId);
  for (const sale of account.sales) {
    const allocation = account.summary.sales[sale.id];
    // Los cancelados no reciben imputación: quedan como estaban.
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
