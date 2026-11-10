import type { SaleState } from "@/generated/prisma/enums";
import { fromCents, isCharged, toCents, type AccountSummary } from "./account";

// Pure: credit check when confirming an order. It does not block: if the customer
// exceeds their limit or has an overdue debt, the order is held until
// the admin approves it (or cancels it).

type Numeric = { toString(): string } | string;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Comment when approving a held order. */
export const CREDIT_RELEASE_NOTE_MAX_LENGTH = 300;

/** Why an order was held (stored in `sales.credit_hold_reasons`). */
export type CreditHoldReasons = {
  /** Debt + open orders (with this one) against the limit. */
  limit?: { limit: string; exposure: string };
  /** The oldest delivered unpaid order, past the term. */
  overdue?: { since: string; termDays: number };
};

/**
 * What the customer owes or will owe: what is pending collection across all their
 * non-canceled orders (delivered and open). `summarizeAccount` has already allocated
 * what was paid to all of them, so a credit balance reduces it.
 */
export function creditExposure(summary: AccountSummary): string {
  let total = BigInt(0);
  for (const allocation of Object.values(summary.sales)) {
    total += toCents(allocation.pending);
  }
  return fromCents(total);
}

/**
 * Which checks the customer fails now (with the new order already counted in the
 * account). null if none: the order goes on as normal.
 */
export function checkCredit(input: {
  creditLimit: Numeric | null;
  paymentTermDays: number | null;
  summary: AccountSummary;
  sales: { id: string; state: SaleState; deliveredAt: Date | null }[];
  now: Date;
}): CreditHoldReasons | null {
  const reasons: CreditHoldReasons = {};

  if (input.creditLimit !== null) {
    const exposure = creditExposure(input.summary);
    if (toCents(exposure) > toCents(input.creditLimit)) {
      reasons.limit = {
        limit: fromCents(toCents(input.creditLimit)),
        exposure,
      };
    }
  }

  if (input.paymentTermDays !== null) {
    const cutoff = input.now.getTime() - input.paymentTermDays * DAY_MS;
    let oldest: Date | null = null;
    for (const sale of input.sales) {
      const allocation = input.summary.sales[sale.id];
      if (!isCharged(sale.state) || !sale.deliveredAt || !allocation) continue;
      if (toCents(allocation.pending) <= BigInt(0)) continue;
      if (sale.deliveredAt.getTime() >= cutoff) continue;
      if (!oldest || sale.deliveredAt < oldest) oldest = sale.deliveredAt;
    }
    if (oldest) {
      reasons.overdue = {
        since: oldest.toISOString(),
        termDays: input.paymentTermDays,
      };
    }
  }

  return reasons.limit || reasons.overdue ? reasons : null;
}

/** Held = marked and not yet approved. */
export function isOnCreditHold(sale: {
  creditHoldAt: Date | null;
  creditReleasedAt: Date | null;
}): boolean {
  return sale.creditHoldAt !== null && sale.creditReleasedAt === null;
}
