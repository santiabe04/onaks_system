import type { SaleState } from "@/generated/prisma/enums";
import { fromCents, isCharged, toCents, type AccountSummary } from "./account";

// Puro: control de crédito al confirmar un pedido. No bloquea: si el cliente
// supera su límite o tiene deuda vencida, el pedido queda retenido hasta que
// el admin lo aprueba (o lo cancela).

type Numeric = { toString(): string } | string;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Comentario al aprobar un pedido retenido. */
export const CREDIT_RELEASE_NOTE_MAX_LENGTH = 300;

/** Por qué se retuvo un pedido (se guarda en `sales.credit_hold_reasons`). */
export type CreditHoldReasons = {
  /** Deuda + pedidos abiertos (con este) contra el límite. */
  limit?: { limit: string; exposure: string };
  /** El pedido entregado sin pagar más viejo, fuera del plazo. */
  overdue?: { since: string; termDays: number };
};

/**
 * Lo que el cliente debe o va a deber: lo pendiente de cobro de todos sus
 * pedidos no cancelados (entregados y abiertos). `summarizeAccount` ya imputó
 * lo pagado a todos, así que un saldo a favor lo reduce.
 */
export function creditExposure(summary: AccountSummary): string {
  let total = BigInt(0);
  for (const allocation of Object.values(summary.sales)) {
    total += toCents(allocation.pending);
  }
  return fromCents(total);
}

/**
 * Qué controles falla el cliente ahora (con el pedido nuevo ya contado en la
 * cuenta). null si ninguno: el pedido sigue normal.
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

/** Retenido = marcado y todavía sin aprobar. */
export function isOnCreditHold(sale: {
  creditHoldAt: Date | null;
  creditReleasedAt: Date | null;
}): boolean {
  return sale.creditHoldAt !== null && sale.creditReleasedAt === null;
}
