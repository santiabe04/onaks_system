import type { InvoiceType } from "@/generated/prisma/enums";
import { interpolate } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/es";
import { fromCents, toCents } from "./account";
import { cartTotals } from "./cart";
import { parseDecimalInput, PRICE_LIMITS } from "./decimal-input";
import { fromMilli, QUANTITY_LIMITS, toMilli } from "./quantity";

// Puro: facturas de proveedores y el control de 3 vías (OC, recepciones y factura).

export const INVOICE_TYPES: InvoiceType[] = ["A", "B", "C"];
export const INVOICE_NOTES_MAX_LENGTH = 300;
const MAX_POINT_OF_SALE = 99999;
const MAX_NUMBER = 99999999;
const ZERO = BigInt(0);

type Numeric = { toString(): string } | string;
type Messages = Dictionary["invoices"]["errors"];

/** "A 00003-00012345", como se lee en el comprobante. */
export function formatInvoiceNumber(invoice: {
  type: InvoiceType;
  pointOfSale: number;
  number: number;
}): string {
  return `${invoice.type} ${String(invoice.pointOfSale).padStart(5, "0")}-${String(
    invoice.number,
  ).padStart(8, "0")}`;
}

/** Lo recibido que todavía no se facturó (no negativo). */
export function pendingToInvoice(received: Numeric, invoiced: Numeric): string {
  const missing = toMilli(received) - toMilli(invoiced);
  return fromMilli(missing > ZERO ? missing : ZERO);
}

/** Lo facturado por producto en las facturas sin anular de una OC. */
export function invoicedQuantities(
  invoices: {
    state: string;
    items: { productId: string; quantity: { toString(): string } }[];
  }[],
): Map<string, string> {
  const totals = new Map<string, bigint>();
  for (const invoice of invoices) {
    if (invoice.state === "ANNULLED") continue;
    for (const item of invoice.items) {
      totals.set(
        item.productId,
        (totals.get(item.productId) ?? BigInt(0)) + toMilli(item.quantity),
      );
    }
  }
  return new Map(
    [...totals].map(([productId, milli]) => [productId, fromMilli(milli)]),
  );
}

export type InvoiceHeader = {
  type: InvoiceType;
  pointOfSale: number;
  number: number;
  /** YYYY-MM-DD. */
  issueDate: string;
  dueDate: string | null;
  vatPerception: string;
  iibbPerception: string;
  otherTaxes: string;
  printedTotal: string;
  notes: string | null;
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;
export const isDay = (value: string) =>
  DAY.test(value) && !Number.isNaN(Date.parse(value));

export type Voucher = {
  type: InvoiceType;
  pointOfSale: number;
  number: number;
  /** YYYY-MM-DD. */
  issueDate: string;
};

/** Tipo, punto de venta, número y fecha de un comprobante (factura o nota de crédito). */
export function parseVoucher(
  formData: FormData,
  t: Pick<Messages, "type" | "number" | "issueDate">,
): { ok: true; data: Voucher } | { ok: false; error: string } {
  const read = (key: string) => {
    const value = formData.get(key);
    return typeof value === "string" ? value.trim() : "";
  };
  const type = read("type") as InvoiceType;
  if (!INVOICE_TYPES.includes(type)) return { ok: false, error: t.type };
  const whole = (raw: string, max: number) =>
    /^\d{1,8}$/.test(raw) && Number(raw) >= 1 && Number(raw) <= max
      ? Number(raw)
      : null;
  const pointOfSale = whole(read("pointOfSale"), MAX_POINT_OF_SALE);
  const number = whole(read("number"), MAX_NUMBER);
  if (pointOfSale === null || number === null) {
    return { ok: false, error: t.number };
  }
  const issueDate = read("issueDate");
  if (!isDay(issueDate)) return { ok: false, error: t.issueDate };
  return { ok: true, data: { type, pointOfSale, number, issueDate } };
}

export function parseInvoiceHeader(
  formData: FormData,
  t: Messages,
): { ok: true; data: InvoiceHeader } | { ok: false; error: string } {
  const read = (key: string) => {
    const value = formData.get(key);
    return typeof value === "string" ? value.trim() : "";
  };
  const voucher = parseVoucher(formData, t);
  if (!voucher.ok) return voucher;
  const { type, pointOfSale, number, issueDate } = voucher.data;

  const dueDate = read("dueDate");
  if (dueDate && (!isDay(dueDate) || dueDate < issueDate)) {
    return { ok: false, error: t.dueDate };
  }

  // Percepciones: en blanco es 0.
  const amount = (key: string) => {
    const raw = read(key);
    return raw ? parseDecimalInput(raw, PRICE_LIMITS) : "0";
  };
  const vatPerception = amount("vatPerception");
  const iibbPerception = amount("iibbPerception");
  const otherTaxes = amount("otherTaxes");
  if (
    vatPerception === null ||
    iibbPerception === null ||
    otherTaxes === null
  ) {
    return { ok: false, error: t.amount };
  }
  const printedTotal = parseDecimalInput(read("printedTotal"), PRICE_LIMITS);
  if (printedTotal === null) return { ok: false, error: t.printedTotal };

  const notes = read("notes");
  if (notes.length > INVOICE_NOTES_MAX_LENGTH) {
    return {
      ok: false,
      error: interpolate(t.tooLong, { max: INVOICE_NOTES_MAX_LENGTH }),
    };
  }
  return {
    ok: true,
    data: {
      type,
      pointOfSale,
      number,
      issueDate,
      dueDate: dueDate || null,
      vatPerception,
      iibbPerception,
      otherTaxes,
      printedTotal,
      notes: notes || null,
    },
  };
}

export type InvoiceLine = {
  productId: string;
  quantity: string;
  /** Costo neto unitario facturado. */
  unitCost: string;
};

/**
 * Las líneas del form (`qty_<producto>`, `cost_<producto>`), solo de productos
 * de la OC: sin cantidad (o 0) no se factura. Tiene que haber al menos una.
 */
export function parseInvoiceLines(
  formData: FormData,
  products: { productId: string; allowsDecimals: boolean }[],
  t: Messages,
): { ok: true; lines: InvoiceLine[] } | { ok: false; error: string } {
  const read = (key: string) => {
    const value = formData.get(key);
    return typeof value === "string" ? value.trim() : "";
  };
  const lines: InvoiceLine[] = [];
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
      PRICE_LIMITS,
    );
    if (unitCost === null) return { ok: false, error: t.cost };
    lines.push({
      productId: product.productId,
      quantity: fromMilli(toMilli(quantity)),
      unitCost,
    });
  }
  if (lines.length === 0) return { ok: false, error: t.noLines };
  return { ok: true, lines };
}

/** Neto e IVA de las líneas (con la alícuota de la OC) más las percepciones. */
export function invoiceTotals(
  lines: { quantity: Numeric; unitCost: Numeric; taxRate: Numeric }[],
  taxes: {
    vatPerception: Numeric;
    iibbPerception: Numeric;
    otherTaxes: Numeric;
  },
): { net: string; tax: string; total: string } {
  const totals = cartTotals(
    lines.map((line) => ({
      price: line.unitCost,
      rate: line.taxRate,
      quantity: line.quantity,
      weight: "0",
    })),
  );
  const total =
    toCents(totals.total) +
    toCents(taxes.vatPerception) +
    toCents(taxes.iibbPerception) +
    toCents(taxes.otherTaxes);
  return { net: totals.net, tax: totals.tax, total: fromCents(total) };
}

export type MatchDifference =
  | {
      kind: "PRICE";
      productId: string;
      /** Costo pactado en la OC. */
      expected: string;
      actual: string;
    }
  | {
      kind: "QUANTITY";
      productId: string;
      /** Lo recibido que faltaba facturar. */
      expected: string;
      actual: string;
    }
  | { kind: "TOTAL"; expected: string; actual: string };

/**
 * Control de 3 vías: cada línea contra la OC (costo, al centavo) y contra lo
 * recibido sin facturar (no se factura más de lo que llegó), y el total
 * impreso contra el calculado. Sin diferencias, la factura queda aprobada.
 */
export function matchInvoice(input: {
  lines: InvoiceLine[];
  order: {
    productId: string;
    unitCost: Numeric;
    received: Numeric;
    invoiced: Numeric;
  }[];
  computedTotal: Numeric;
  printedTotal: Numeric;
}): MatchDifference[] {
  const differences: MatchDifference[] = [];
  for (const line of input.lines) {
    const item = input.order.find((row) => row.productId === line.productId);
    if (!item) continue;
    if (toCents(line.unitCost) !== toCents(item.unitCost)) {
      differences.push({
        kind: "PRICE",
        productId: line.productId,
        expected: fromCents(toCents(item.unitCost)),
        actual: fromCents(toCents(line.unitCost)),
      });
    }
    const pending = pendingToInvoice(item.received, item.invoiced);
    if (toMilli(line.quantity) > toMilli(pending)) {
      differences.push({
        kind: "QUANTITY",
        productId: line.productId,
        expected: pending,
        actual: line.quantity,
      });
    }
  }
  if (toCents(input.printedTotal) !== toCents(input.computedTotal)) {
    differences.push({
      kind: "TOTAL",
      expected: fromCents(toCents(input.computedTotal)),
      actual: fromCents(toCents(input.printedTotal)),
    });
  }
  return differences;
}

/**
 * El último costo del proveedor se actualiza con una factura aprobada, salvo
 * que ya haya uno de una factura más nueva.
 */
export function isNewerCost(
  issueDate: string,
  lastCostAt: Date | null,
): boolean {
  if (!lastCostAt) return true;
  return issueDate >= lastCostAt.toISOString().slice(0, 10);
}
