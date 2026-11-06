import { ReturnDestination, type SaleState } from "@/generated/prisma/enums";
import type { Dictionary } from "@/i18n/dictionaries/es";
import { CHARGED_SALE_STATES } from "./account";
import { cartTotals, parseCartQuantity } from "./cart";
import { parseDecimalInput, PRICE_LIMITS } from "./decimal-input";
import { fromMilli, toMilli } from "./quantity";

// Puro: notas de crédito al cliente. Una devolución sale de un pedido
// entregado (productos, cantidades y qué se hace con cada uno); un ajuste es
// solo un importe. El monto de una devolución es lo que el cliente pagó por
// eso (precio y alícuota del pedido), no el precio de hoy.

export const CREDIT_NOTE_REASON_MAX_LENGTH = 300;

type Messages = Dictionary["customerCreditNotes"]["errors"];
type Numeric = { toString(): string } | string;

/** Solo se devuelve de un pedido entregado (es cuando pasó a ser deuda). */
export function isReturnable(state: SaleState): boolean {
  return CHARGED_SALE_STATES.includes(state);
}

/** Una línea del pedido con lo que ya se devolvió, para ofrecer lo que queda. */
export type ReturnableLine = {
  productId: string;
  /** Entregado (ya con los faltantes descontados). */
  quantity: Numeric;
  /** Ya devuelto en notas de crédito vigentes. */
  returned: Numeric;
  unitPrice: Numeric;
  unitTaxRate: Numeric;
  allowsDecimals: boolean;
};

/** Lo que todavía se puede devolver de una línea ("2.5"), nunca negativo. */
export function remainingQuantity(line: {
  quantity: Numeric;
  returned: Numeric;
}): string {
  const left = toMilli(line.quantity) - toMilli(line.returned);
  return fromMilli(left > BigInt(0) ? left : BigInt(0));
}

/** Total (con IVA) de lo devuelto: precio y alícuota del pedido, a centavos. */
export function returnAmount(
  lines: { quantity: Numeric; unitPrice: Numeric; unitTaxRate: Numeric }[],
): string {
  return cartTotals(
    lines.map((line) => ({
      price: line.unitPrice,
      rate: line.unitTaxRate,
      quantity: line.quantity,
      weight: "0",
    })),
  ).total;
}

export type ReturnInput = {
  warehouseId: string;
  reason: string;
  lines: {
    productId: string;
    quantity: string;
    destination: ReturnDestination;
  }[];
};

function read(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Lee el form de devolución: `warehouse`, `reason` y, por cada producto,
 * `qty_<id>` (vacío o 0 = no se devuelve) y `dest_<id>`. Valida contra lo
 * que se puede devolver ahora; la acción lo vuelve a validar con la cuenta
 * bloqueada.
 */
export function parseReturn(
  formData: FormData,
  lines: ReturnableLine[],
  t: Messages,
): { ok: true; data: ReturnInput } | { ok: false; error: string } {
  const warehouseId = read(formData, "warehouse");
  if (!warehouseId) return { ok: false, error: t.warehouse };
  const reason = read(formData, "reason");
  if (!reason) return { ok: false, error: t.reasonRequired };
  if (reason.length > CREDIT_NOTE_REASON_MAX_LENGTH) {
    return { ok: false, error: t.reasonTooLong };
  }

  const parsed: ReturnInput["lines"] = [];
  for (const line of lines) {
    const raw = read(formData, `qty_${line.productId}`);
    if (!raw || /^0+([.,]0*)?$/.test(raw)) continue;
    const quantity = parseCartQuantity(raw, line.allowsDecimals);
    if (!quantity || toMilli(quantity) > toMilli(remainingQuantity(line))) {
      return { ok: false, error: t.quantity };
    }
    const destination = read(formData, `dest_${line.productId}`);
    if (!(Object.values(ReturnDestination) as string[]).includes(destination)) {
      return { ok: false, error: t.destination };
    }
    parsed.push({
      productId: line.productId,
      quantity,
      destination: destination as ReturnDestination,
    });
  }
  if (parsed.length === 0) return { ok: false, error: t.noLines };
  return { ok: true, data: { warehouseId, reason, lines: parsed } };
}

export type AdjustmentInput = { amount: string; reason: string };

/** Nota de crédito por importe: monto mayor a 0 (con IVA) y motivo. */
export function parseAdjustment(
  formData: FormData,
  t: Messages,
): { ok: true; data: AdjustmentInput } | { ok: false; error: string } {
  const amount = parseDecimalInput(read(formData, "amount"), PRICE_LIMITS);
  if (amount === null || Number(amount) <= 0) {
    return { ok: false, error: t.amount };
  }
  const reason = read(formData, "reason");
  if (!reason) return { ok: false, error: t.reasonRequired };
  if (reason.length > CREDIT_NOTE_REASON_MAX_LENGTH) {
    return { ok: false, error: t.reasonTooLong };
  }
  return { ok: true, data: { amount, reason } };
}
