import type { PurchaseOrderState } from "@/generated/prisma/enums";
import { interpolate } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/es";
import { parseDecimalInput } from "./decimal-input";
import { isCuid } from "./ids";
import { isValidDay, LOT_CODE_MAX_LENGTH, normalizeLotCode } from "./lots";
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

/** Cuánto llegó de un lote (con su vencimiento, YYYY-MM-DD). */
export type ReceiptLot = { code: string; expiresOn: string; quantity: string };

export type ReceiptLine = {
  productId: string;
  quantity: string;
  /** Cómo se reparte entre lotes, solo de productos que controlan vencimiento. */
  lots?: ReceiptLot[];
};

/** Cuántos lotes distintos se pueden cargar de un producto en un informe. */
export const MAX_LOTS_PER_LINE = 5;

/**
 * Las cantidades recibidas del form (`rcv_<producto>`), solo de productos de
 * la OC: en blanco o 0, no llegó. Tiene que llegar al menos uno. Lo que llegó
 * de un producto que controla vencimiento se reparte en lotes: filas
 * `lot_<producto>_<n>` (código), `exp_<producto>_<n>` (fecha) y `lq_<producto>_<n>`
 * (cantidad; con una sola fila puede quedar en blanco y es todo lo que llegó).
 */
export function parseReceiptLines(
  formData: FormData,
  products: {
    productId: string;
    allowsDecimals: boolean;
    tracksExpiry?: boolean;
  }[],
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
    const line: ReceiptLine = {
      productId: product.productId,
      quantity: fromMilli(toMilli(quantity)),
    };
    if (product.tracksExpiry) {
      const text = (key: string, n: number) => {
        const field = formData.get(`${key}_${product.productId}_${n}`);
        return typeof field === "string" ? field.trim() : "";
      };
      const rows: ReceiptLot[] = [];
      for (let n = 0; n < MAX_LOTS_PER_LINE; n++) {
        const [code, expiresOn, rowQuantity] = [
          normalizeLotCode(text("lot", n)),
          text("exp", n),
          text("lq", n),
        ];
        // Una fila sin nada es una fila sin usar.
        if (!code && !expiresOn && !rowQuantity) continue;
        if (!code) return { ok: false, error: t.lotRequired };
        if (code.length > LOT_CODE_MAX_LENGTH) {
          return {
            ok: false,
            error: interpolate(t.tooLong, { max: LOT_CODE_MAX_LENGTH }),
          };
        }
        if (!isValidDay(expiresOn)) {
          return { ok: false, error: t.expiryInvalid };
        }
        let lotQuantity = line.quantity;
        if (rowQuantity) {
          const parsed = parseDecimalInput(rowQuantity, {
            ...QUANTITY_LIMITS,
            maxDecimals: product.allowsDecimals
              ? QUANTITY_LIMITS.maxDecimals
              : 0,
          });
          if (parsed === null || toMilli(parsed) === ZERO) {
            return { ok: false, error: t.lotQuantities };
          }
          lotQuantity = fromMilli(toMilli(parsed));
        } else if (rows.length > 0 || n > 0) {
          // Con más de una fila, cada una dice cuánto trae.
          return { ok: false, error: t.lotQuantities };
        }
        if (
          rows.some((row) => row.code === code && row.expiresOn === expiresOn)
        ) {
          return { ok: false, error: t.lotRepeated };
        }
        rows.push({ code, expiresOn, quantity: lotQuantity });
      }
      if (rows.length === 0) return { ok: false, error: t.lotRequired };
      const total = rows.reduce(
        (sum, row) => sum + toMilli(row.quantity),
        ZERO,
      );
      if (total !== toMilli(line.quantity)) {
        return { ok: false, error: t.lotQuantities };
      }
      line.lots = rows;
    }
    lines.push(line);
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
