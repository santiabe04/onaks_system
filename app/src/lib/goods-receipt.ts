import type { PurchaseOrderState } from "@/generated/prisma/enums";
import { interpolate } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/es";
import { parseDecimalInput } from "./decimal-input";
import { isCuid } from "./ids";
import { fromMilli, QUANTITY_LIMITS, toMilli } from "./quantity";

// Puro: informes de recepción (IR) de las órdenes de compra.

export const RECEIPT_NOTES_MAX_LENGTH = 300;
export const DELIVERY_NOTE_MAX_LENGTH = 50;
const ZERO = BigInt(0);

type Numeric = { toString(): string } | string;
type Messages = Dictionary["receipts"]["errors"];

/** OC a las que se les puede cargar mercadería. */
export const RECEIVABLE_PO_STATES: PurchaseOrderState[] = [
  "SENT",
  "PARTIALLY_RECEIVED",
];

/** Lo que falta llegar de una línea de la OC (lo recibido de más no cuenta). */
export function pendingQuantity(item: {
  quantity: Numeric;
  receivedQuantity: Numeric;
}): string {
  const missing = toMilli(item.quantity) - toMilli(item.receivedQuantity);
  return fromMilli(missing > ZERO ? missing : ZERO);
}

/**
 * Lo recibido contra lo que faltaba: positivo si llegó de más, negativo si
 * llegó de menos, "0" si coincide.
 */
export function receiptDifference(pending: Numeric, received: Numeric): string {
  return fromMilli(toMilli(received) - toMilli(pending));
}

/**
 * Estado de la OC según lo recibido: nada → Enviada, todo (o más) en cada
 * línea → Recibida, si no → Recibida parcial.
 */
export function orderStateFor(
  items: { quantity: Numeric; receivedQuantity: Numeric }[],
): PurchaseOrderState {
  const received = items.filter(
    (item) => toMilli(item.receivedQuantity) > ZERO,
  );
  if (received.length === 0) return "SENT";
  const complete = items.every(
    (item) => toMilli(item.receivedQuantity) >= toMilli(item.quantity),
  );
  return complete ? "RECEIVED" : "PARTIALLY_RECEIVED";
}

export type ReceiptLine = { productId: string; quantity: string };

/**
 * Las cantidades recibidas del form (`rcv_<producto>`), solo de productos de
 * la OC: en blanco o 0, no llegó. Tiene que llegar al menos uno.
 */
export function parseReceiptLines(
  formData: FormData,
  products: { productId: string; allowsDecimals: boolean }[],
  t: Messages,
): { ok: true; lines: ReceiptLine[] } | { ok: false; error: string } {
  const lines: ReceiptLine[] = [];
  for (const product of products) {
    const value = formData.get(`rcv_${product.productId}`);
    const raw = typeof value === "string" ? value.trim() : "";
    if (!raw) continue;
    const quantity = parseDecimalInput(raw, {
      ...QUANTITY_LIMITS,
      maxDecimals: product.allowsDecimals ? QUANTITY_LIMITS.maxDecimals : 0,
    });
    if (quantity === null) return { ok: false, error: t.quantity };
    if (toMilli(quantity) === ZERO) continue;
    lines.push({
      productId: product.productId,
      quantity: fromMilli(toMilli(quantity)),
    });
  }
  if (lines.length === 0) return { ok: false, error: t.noLines };
  return { ok: true, lines };
}

export type ReceiptHeader = {
  warehouseId: string;
  deliveryNote: string | null;
  notes: string | null;
};

export function parseReceiptHeader(
  formData: FormData,
  t: Messages,
): { ok: true; data: ReceiptHeader } | { ok: false; error: string } {
  const read = (key: string) => {
    const value = formData.get(key);
    return typeof value === "string" ? value.trim() : "";
  };
  const warehouseId = read("warehouseId");
  if (!isCuid(warehouseId)) return { ok: false, error: t.warehouse };
  const deliveryNote = read("deliveryNote");
  if (deliveryNote.length > DELIVERY_NOTE_MAX_LENGTH) {
    return {
      ok: false,
      error: interpolate(t.tooLong, { max: DELIVERY_NOTE_MAX_LENGTH }),
    };
  }
  const notes = read("notes");
  if (notes.length > RECEIPT_NOTES_MAX_LENGTH) {
    return {
      ok: false,
      error: interpolate(t.tooLong, { max: RECEIPT_NOTES_MAX_LENGTH }),
    };
  }
  return {
    ok: true,
    data: {
      warehouseId,
      deliveryNote: deliveryNote || null,
      notes: notes || null,
    },
  };
}

/** Motivo obligatorio (anular un IR o una factura, cerrar una OC con faltante, aprobar). */
export function parseReason(
  formData: FormData,
  t: Pick<Messages, "reasonRequired" | "tooLong">,
): { ok: true; reason: string } | { ok: false; error: string } {
  const value = formData.get("reason");
  const reason = typeof value === "string" ? value.trim() : "";
  if (!reason) return { ok: false, error: t.reasonRequired };
  if (reason.length > RECEIPT_NOTES_MAX_LENGTH) {
    return {
      ok: false,
      error: interpolate(t.tooLong, { max: RECEIPT_NOTES_MAX_LENGTH }),
    };
  }
  return { ok: true, reason };
}
