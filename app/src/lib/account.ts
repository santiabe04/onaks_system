import type {
  CustomerPaymentKind,
  SalePaymentState,
  SaleState,
} from "@/generated/prisma/enums";

// Pure: a customer's account. Everything in cents (BigInt).
//
// - An order is a debt when it is delivered (Delivered or Finished).
// - Payments and refunds belong to the customer, not to an order: what was collected (net of
//   refunds) is allocated automatically, from the oldest order to the newest. What is
//   left over covers in advance the orders not yet delivered.
// - Balance = delivered − collected: positive is debt, negative is a credit balance.

type Numeric = { toString(): string } | string;

/** States in which the order is already the customer's debt. */
export const CHARGED_SALE_STATES: SaleState[] = ["DELIVERED", "FINISHED"];

export function isCharged(state: SaleState): boolean {
  return CHARGED_SALE_STATES.includes(state);
}

export type AccountSale = {
  id: string;
  number: number;
  state: SaleState;
  total: Numeric;
};

export type AccountPayment = {
  kind: CustomerPaymentKind;
  amount: Numeric;
  /** Voided ones do not count. */
  voided: boolean;
};

export type AccountCreditNote = {
  amount: Numeric;
  /** Voided ones do not count. */
  voided: boolean;
};

export type SaleAllocation = {
  /** What was allocated to this order ("1234.50"). */
  paid: string;
  /** What is left to collect on this order. */
  pending: string;
  paymentState: SalePaymentState;
};

export type AccountSummary = {
  /** Delivered − collected. Positive: owes; negative: credit balance. */
  balance: string;
  /** Total delivered (the gross debt). */
  charged: string;
  /** Payments − refunds. */
  paid: string;
  /** Valid credit notes: they lower the debt just like a payment. */
  credited: string;
  /** Per order (canceled ones receive no allocation). */
  sales: Record<string, SaleAllocation>;
};

const ZERO = BigInt(0);
const HUNDRED = BigInt(100);

export function toCents(value: Numeric): bigint {
  const text = value.toString().trim();
  const negative = text.startsWith("-");
  const [integer, decimals = ""] = text.replace(/^[-+]/, "").split(".");
  const cents = BigInt((integer || "0") + decimals.padEnd(2, "0").slice(0, 2));
  return negative ? -cents : cents;
}

export function fromCents(value: bigint): string {
  const negative = value < ZERO;
  const abs = negative ? -value : value;
  return `${negative ? "-" : ""}${abs / HUNDRED}.${String(abs % HUNDRED).padStart(2, "0")}`;
}

function min(a: bigint, b: bigint): bigint {
  return a < b ? a : b;
}

/**
 * Allocates what was collected to the orders (from the oldest to the newest by number):
 * first the delivered ones, which are debt; with what is left over, the ones not yet
 * delivered (paid in advance). Canceled ones are left out.
 */
export function summarizeAccount(
  sales: AccountSale[],
  payments: AccountPayment[],
  creditNotes: AccountCreditNote[] = [],
): AccountSummary {
  let paid = ZERO;
  for (const payment of payments) {
    if (payment.voided) continue;
    const amount = toCents(payment.amount);
    paid += payment.kind === "PAYMENT" ? amount : -amount;
  }

  let credited = ZERO;
  for (const note of creditNotes) {
    if (!note.voided) credited += toCents(note.amount);
  }

  const ordered = [...sales]
    .filter((sale) => sale.state !== "CANCELED")
    .sort((a, b) => a.number - b.number);
  const charged = ordered.filter((sale) => isCharged(sale.state));
  const upcoming = ordered.filter((sale) => !isCharged(sale.state));

  // A payment and a credit note lower the debt the same way: they are allocated to the oldest.
  const settled = paid + credited;
  let available = settled > ZERO ? settled : ZERO;
  const result: Record<string, SaleAllocation> = {};
  for (const sale of [...charged, ...upcoming]) {
    const total = toCents(sale.total);
    const applied = min(available, total);
    available -= applied;
    result[sale.id] = {
      paid: fromCents(applied),
      pending: fromCents(total - applied),
      paymentState:
        applied === ZERO
          ? "PENDING"
          : applied === total
            ? "PAID"
            : "PARTIALLY_PAID",
    };
  }

  const chargedTotal = charged.reduce(
    (sum, sale) => sum + toCents(sale.total),
    ZERO,
  );
  return {
    balance: fromCents(chargedTotal - settled),
    charged: fromCents(chargedTotal),
    paid: fromCents(paid),
    credited: fromCents(credited),
    sales: result,
  };
}

/** The most that can be refunded: the credit balance (0 if it owes). */
export function maxRefund(balance: Numeric): string {
  const cents = toCents(balance);
  return fromCents(cents < ZERO ? -cents : ZERO);
}
