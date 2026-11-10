import "server-only";
import { db } from "./db";

export type AccountBalanceRow = {
  id: string;
  tradeName: string;
  /** Deactivated: they can still owe. */
  deleted: boolean;
  /** Delivered − collected ("1234.50"): positive owes, negative credit balance. */
  balance: string;
  /** The oldest delivered unpaid order (age of the debt). */
  oldestUnpaid: Date | null;
  lastPayment: Date | null;
};

/**
 * Customers with a non-zero balance, from the largest debt to the largest credit balance.
 * Same account as `summarizeAccount`, but in SQL for all customers:
 * delivered orders minus net payments, refunds and credit notes (without
 * the voided ones). The
 * age comes from the payment status already calculated in `sales`.
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
    ), "credited" AS (
      SELECT "customer_id", SUM("amount") AS "amount"
      FROM "customer_credit_notes"
      WHERE "voided_at" IS NULL
      GROUP BY "customer_id"
    ), "balances" AS (
      SELECT c."id", c."trade_name", c."deleted_at",
             COALESCE(ch."amount", 0) - COALESCE(p."amount", 0) - COALESCE(cn."amount", 0) AS "balance",
             ch."oldest_unpaid", p."last_payment"
      FROM "customers" c
      LEFT JOIN "charged" ch ON ch."customer_id" = c."id"
      LEFT JOIN "paid" p ON p."customer_id" = c."id"
      LEFT JOIN "credited" cn ON cn."customer_id" = c."id"
    )
    SELECT "id", "trade_name" AS "tradeName", "deleted_at" IS NOT NULL AS "deleted",
           "balance"::text AS "balance",
           "oldest_unpaid" AS "oldestUnpaid", "last_payment" AS "lastPayment"
    FROM "balances"
    WHERE "balance" <> 0
    ORDER BY "balance" DESC, "trade_name"`;
}
