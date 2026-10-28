import type {
  CustomerPaymentKind,
  SalePaymentState,
  SaleState,
} from "@/generated/prisma/enums";

// Puro: la cuenta corriente de un cliente. Todo en centavos (BigInt).
//
// - Un pedido es deuda cuando se entrega (Entregado o Finalizado).
// - Cobros y reintegros son del cliente, no de un pedido: lo cobrado (neto de
//   reintegros) se imputa solo, del pedido más viejo al más nuevo. Lo que
//   sobra cubre por adelantado los pedidos todavía no entregados.
// - Saldo = entregado − cobrado: positivo es deuda, negativo es saldo a favor.

type Numeric = { toString(): string } | string;

/** Estados en los que el pedido ya es deuda del cliente. */
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
  /** Los anulados no cuentan. */
  voided: boolean;
};

export type SaleAllocation = {
  /** Lo imputado a este pedido ("1234.50"). */
  paid: string;
  /** Lo que falta cobrar de este pedido. */
  pending: string;
  paymentState: SalePaymentState;
};

export type AccountSummary = {
  /** Entregado − cobrado. Positivo: debe; negativo: saldo a favor. */
  balance: string;
  /** Total entregado (la deuda bruta). */
  charged: string;
  /** Cobros − reintegros. */
  paid: string;
  /** Por pedido (los cancelados no reciben imputación). */
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
 * Imputa lo cobrado a los pedidos (del más viejo al más nuevo por número):
 * primero los entregados, que son deuda; con lo que sobra, los que todavía no
 * se entregaron (pagados por adelantado). Los cancelados quedan afuera.
 */
export function summarizeAccount(
  sales: AccountSale[],
  payments: AccountPayment[],
): AccountSummary {
  let paid = ZERO;
  for (const payment of payments) {
    if (payment.voided) continue;
    const amount = toCents(payment.amount);
    paid += payment.kind === "PAYMENT" ? amount : -amount;
  }

  const ordered = [...sales]
    .filter((sale) => sale.state !== "CANCELED")
    .sort((a, b) => a.number - b.number);
  const charged = ordered.filter((sale) => isCharged(sale.state));
  const upcoming = ordered.filter((sale) => !isCharged(sale.state));

  let available = paid > ZERO ? paid : ZERO;
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
    balance: fromCents(chargedTotal - paid),
    charged: fromCents(chargedTotal),
    paid: fromCents(paid),
    sales: result,
  };
}

/** Lo máximo que se puede reintegrar: el saldo a favor (0 si debe). */
export function maxRefund(balance: Numeric): string {
  const cents = toCents(balance);
  return fromCents(cents < ZERO ? -cents : ZERO);
}
