import "server-only";
import { db } from "./db";

export type AccountBalanceRow = {
  id: string;
  tradeName: string;
  /** Dado de baja: puede seguir debiendo. */
  deleted: boolean;
  /** Entregado − cobrado ("1234.50"): positivo debe, negativo a favor. */
  balance: string;
  /** El pedido entregado sin pagar más viejo (antigüedad de la deuda). */
  oldestUnpaid: Date | null;
  lastPayment: Date | null;
};

/**
 * Clientes con saldo distinto de 0, de mayor deuda a mayor saldo a favor.
 * Misma cuenta que `summarizeAccount`, pero en SQL para todos los clientes:
 * pedidos entregados menos cobros netos de reintegros (sin los anulados). La
 * antigüedad sale del estado de pago ya calculado en `sales`.
 */
export async function getAccountBalances(): Promise<AccountBalanceRow[]> {
  return db.$queryRaw<AccountBalanceRow[]>`
    WITH "charged" AS (
      SELECT a."customer_id",
             SUM(s."total") AS "amount",
             MIN(s."created_at") FILTER (WHERE s."payment_state" <> 'PAID') AS "oldest_unpaid"
      FROM "sales" s
      JOIN "customer_addresses" a ON a."id" = s."address_id"
      WHERE s."state" IN ('DELIVERED', 'FINISHED')
      GROUP BY a."customer_id"
    ), "paid" AS (
      SELECT "customer_id",
             SUM(CASE WHEN "kind" = 'PAYMENT' THEN "amount" ELSE -"amount" END) AS "amount",
             MAX("paid_on") FILTER (WHERE "kind" = 'PAYMENT') AS "last_payment"
      FROM "customer_payments"
      WHERE "voided_at" IS NULL
      GROUP BY "customer_id"
    ), "balances" AS (
      SELECT c."id", c."trade_name", c."deleted_at",
             COALESCE(ch."amount", 0) - COALESCE(p."amount", 0) AS "balance",
             ch."oldest_unpaid", p."last_payment"
      FROM "customers" c
      LEFT JOIN "charged" ch ON ch."customer_id" = c."id"
      LEFT JOIN "paid" p ON p."customer_id" = c."id"
    )
    SELECT "id", "trade_name" AS "tradeName", "deleted_at" IS NOT NULL AS "deleted",
           "balance"::text AS "balance",
           "oldest_unpaid" AS "oldestUnpaid", "last_payment" AS "lastPayment"
    FROM "balances"
    WHERE "balance" <> 0
    ORDER BY "balance" DESC, "trade_name"`;
}
