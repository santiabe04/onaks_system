import type { PurchaseOrderState } from "@/generated/prisma/enums";
import { interpolate } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/es";
import { parseDecimalInput } from "./decimal-input";
import { isoDay } from "./order-period";
import { fromMilli, QUANTITY_LIMITS, toMilli } from "./quantity";

// Puro: órdenes de compra (OC) a proveedores.

export const PO_NOTES_MAX_LENGTH = 300;
const MONEY_LIMITS = { maxDecimals: 2, maxIntegerDigits: 10 };
const MILLI = BigInt(1000);
const ZERO = BigInt(0);

type Numeric = { toString(): string } | string;

/** Se edita solo en borrador; se cancela o vuelve a borrador mientras no llegó nada. */
export const PO_EDITABLE: PurchaseOrderState[] = ["DRAFT"];
export const PO_CANCELABLE: PurchaseOrderState[] = ["DRAFT", "SENT"];

/**
 * Cuánto pedir: lo que falta para llegar al mínimo y cubrir lo reservado por
 * pedidos, descontando el stock y lo ya pedido en otras OC sin recibir. Sin
 * decimales, se redondea para arriba (no se piden 2,4 bolsas).
 */
export function suggestQuantity(input: {
  minStock: Numeric | null;
  stock: Numeric;
  reserved: Numeric;
  onOrder: Numeric;
  allowsDecimals: boolean;
}): string {
  const needed =
    toMilli(input.minStock ?? "0") +
    toMilli(input.reserved) -
    toMilli(input.stock) -
    toMilli(input.onOrder);
  if (needed <= ZERO) return "0";
  if (input.allowsDecimals) return fromMilli(needed);
  return fromMilli(((needed + MILLI - BigInt(1)) / MILLI) * MILLI);
}

export type PurchaseLine = {
  productId: string;
  /** "12", "2.5". */
  quantity: string;
  /** Costo neto unitario ("1234.5"). */
  unitCost: string;
};

type Messages = Dictionary["purchases"]["errors"];

/**
 * Las líneas del form (`qty_<producto>`, `cost_<producto>`): sin cantidad (o
 * 0) el producto no va. Con cantidad, el costo es obligatorio.
 */
export function parsePurchaseLines(
  formData: FormData,
  products: { productId: string; allowsDecimals: boolean }[],
  t: Messages,
): { ok: true; lines: PurchaseLine[] } | { ok: false; error: string } {
  const read = (key: string) => {
    const value = formData.get(key);
    return typeof value === "string" ? value.trim() : "";
  };
  const lines: PurchaseLine[] = [];
  for (const product of products) {
    const rawQuantity = read(`qty_${product.productId}`);
    if (!rawQuantity) continue;
    const quantity = parseDecimalInput(rawQuantity, {
      ...QUANTITY_LIMITS,
      maxDecimals: product.allowsDecimals ? QUANTITY_LIMITS.maxDecimals : 0,
    });
    if (quantity === null) return { ok: false, error: t.quantity };
    if (toMilli(quantity) === ZERO) continue;
    const unitCost = parseDecimalInput(
      read(`cost_${product.productId}`),
      MONEY_LIMITS,
    );
    if (unitCost === null) return { ok: false, error: t.cost };
    lines.push({
      productId: product.productId,
      quantity: fromMilli(toMilli(quantity)),
      unitCost,
    });
  }
  return { ok: true, lines };
}

export type PurchaseHeader = {
  /** YYYY-MM-DD o null. */
  expectedDate: string | null;
  notes: string | null;
};

export function parsePurchaseHeader(
  formData: FormData,
  t: Messages,
): { ok: true; data: PurchaseHeader } | { ok: false; error: string } {
  const read = (key: string) => {
    const value = formData.get(key);
    return typeof value === "string" ? value.trim() : "";
  };
  const expectedDate = read("expectedDate");
  if (
    expectedDate &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(expectedDate) ||
      Number.isNaN(Date.parse(expectedDate)))
  ) {
    return { ok: false, error: t.expectedDate };
  }
  const notes = read("notes");
  if (notes.length > PO_NOTES_MAX_LENGTH) {
    return {
      ok: false,
      error: interpolate(t.tooLong, { max: PO_NOTES_MAX_LENGTH }),
    };
  }
  return {
    ok: true,
    data: { expectedDate: expectedDate || null, notes: notes || null },
  };
}

/**
 * La OC como texto para mandar por WhatsApp: proveedor, número, productos con
 * el código del proveedor y la fecha esperada. Sin precios: el proveedor ya
 * los tiene (y así se puede reenviar sin exponer el costo pactado).
 */
export function purchaseOrderText(
  order: {
    number: number;
    supplierName: string;
    expectedDate: Date | null;
    notes: string | null;
    items: {
      name: string;
      supplierCode: string | null;
      quantity: string;
      unit: string;
    }[];
  },
  t: Dictionary["purchases"]["whatsapp"],
  formatDay: (day: string) => string,
): string {
  const lines = [
    interpolate(t.greeting, { supplier: order.supplierName }),
    interpolate(t.header, { number: order.number }),
    "",
    ...order.items.map(
      (item) =>
        `• ${item.quantity} ${item.unit} — ${item.name}${
          item.supplierCode ? ` (${item.supplierCode})` : ""
        }`,
    ),
  ];
  if (order.expectedDate) {
    lines.push(
      "",
      interpolate(t.expected, {
        date: formatDay(order.expectedDate.toISOString().slice(0, 10)),
      }),
    );
  }
  if (order.notes) lines.push("", order.notes);
  lines.push("", t.thanks);
  return lines.join("\n");
}

/** Hoy (Argentina) como YYYY-MM-DD, para el mínimo del input de fecha. */
export function todayIso(now: Date = new Date()): string {
  return isoDay(now);
}
