import type { PurchaseOrderState } from "@/generated/prisma/enums";
import { interpolate } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/es";
import { parseDecimalInput } from "./decimal-input";
import { isCuid } from "./ids";
import { isValidDay, LOT_CODE_MAX_LENGTH, normalizeLotCode } from "./lots";
import { fromMilli, QUANTITY_LIMITS, toMilli } from "./quantity";

// Pure: receiving reports (RR) for purchase orders.

export const RECEIPT_NOTES_MAX_LENGTH = 300;
export const DELIVERY_NOTE_MAX_LENGTH = 50;
const ZERO = BigInt(0);

type Numeric = { toString(): string } | string;
type Messages = Dictionary["receipts"]["errors"];

/** POs to which goods can be entered. */
export const RECEIVABLE_PO_STATES: PurchaseOrderState[] = [
  "SENT",
  "PARTIALLY_RECEIVED",
];

/** What is still to arrive of a PO line (what was received in excess does not count). */
export function pendingQuantity(item: {
  quantity: Numeric;
  receivedQuantity: Numeric;
}): string {
  const missing = toMilli(item.quantity) - toMilli(item.receivedQuantity);
  return fromMilli(missing > ZERO ? missing : ZERO);
}

/**
 * Received against what was missing: positive if more arrived, negative if
 * less arrived, "0" if it matches.
 */
export function receiptDifference(pending: Numeric, received: Numeric): string {
  return fromMilli(toMilli(received) - toMilli(pending));
}

/**
 * PO status from what was received: nothing → Ordered, everything (or more) on each
 * line → Received, otherwise → Partially received.
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

/** How much arrived of a lot (with its expiry, YYYY-MM-DD). */
export type ReceiptLot = { code: string; expiresOn: string; quantity: string };

export type ReceiptLine = {
  productId: string;
  quantity: string;
  /** How it is split across lots, only for products that track expiry. */
  lots?: ReceiptLot[];
};

/** How many different lots of a product can be entered in one report. */
export const MAX_LOTS_PER_LINE = 5;

/**
 * The received quantities from the form (`rcv_<product>`), only for products on
 * the PO: blank or 0, did not arrive. At least one must arrive. What arrived
 * of a product that tracks expiry is split into lots: rows
 * `lot_<product>_<n>` (code), `exp_<product>_<n>` (date) and `lq_<product>_<n>`
 * (quantity; with a single row it can be left blank and it is everything that arrived).
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
        // A row with nothing is an unused row.
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
          // With more than one row, each one says how much it brings.
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

/** Mandatory reason (voiding an RR or an invoice, closing a PO with a shortage, approving). */
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
