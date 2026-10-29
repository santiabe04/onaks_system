import type {
  SupplierInvoiceState,
  SupplierPaymentMethod,
  WithholdingType,
} from "@/generated/prisma/enums";
import { interpolate } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/es";
import { fromCents, toCents } from "./account";
import { parseDecimalInput, PRICE_LIMITS } from "./decimal-input";
import { isDay } from "./supplier-invoice";

// Puro: cuenta corriente de proveedores (órdenes de pago, notas de crédito e
// imputaciones a facturas). Todo en centavos.

export const PAYMENT_METHODS: SupplierPaymentMethod[] = [
  "CASH",
  "TRANSFER",
  "CHECK",
  "WITHHOLDING",
];
export const WITHHOLDING_TYPES: WithholdingType[] = ["VAT", "IIBB", "INCOME"];
export const PAYMENT_NOTES_MAX_LENGTH = 300;
export const MAX_PAYMENT_LINES = 20;
/** Días hacia adelante que cuentan como "vence pronto". */
export const DUE_SOON_DAYS = 7;
const ZERO = BigInt(0);

type Numeric = { toString(): string } | string;
type Messages = Dictionary["supplierPayments"]["errors"];

export type PaymentLine = {
  method: SupplierPaymentMethod;
  amount: string;
  reference: string | null;
  bank: string | null;
  /** Cheque: fecha de pago (YYYY-MM-DD). */
  dueDate: string | null;
  withholdingType: WithholdingType | null;
};

/**
 * Los medios del form (`method_<i>`, `amount_<i>`, `reference_<i>`, `bank_<i>`,
 * `due_<i>`, `withholding_<i>`, con i hasta `lines`). Transferencia, cheque y
 * retención llevan número; el cheque, banco y fecha; la retención, el tipo.
 */
export function parsePaymentLines(
  formData: FormData,
  t: Messages,
):
  | { ok: true; lines: PaymentLine[]; total: string }
  | { ok: false; error: string } {
  const read = (key: string) => {
    const value = formData.get(key);
    return typeof value === "string" ? value.trim() : "";
  };
  const count = Number(read("lines"));
  if (!Number.isInteger(count) || count < 1 || count > MAX_PAYMENT_LINES) {
    return { ok: false, error: t.noLines };
  }
  const lines: PaymentLine[] = [];
  let total = ZERO;
  for (let i = 0; i < count; i++) {
    const method = read(`method_${i}`) as SupplierPaymentMethod;
    if (!PAYMENT_METHODS.includes(method))
      return { ok: false, error: t.method };
    const amount = parseDecimalInput(read(`amount_${i}`), PRICE_LIMITS);
    if (amount === null || toCents(amount) === ZERO) {
      return { ok: false, error: t.amount };
    }
    const reference = read(`reference_${i}`);
    if (reference.length > 50) return { ok: false, error: t.reference };
    if (method !== "CASH" && !reference) {
      return { ok: false, error: t.reference };
    }
    let bank: string | null = null;
    let dueDate: string | null = null;
    let withholdingType: WithholdingType | null = null;
    if (method === "CHECK") {
      bank = read(`bank_${i}`);
      dueDate = read(`due_${i}`);
      if (!bank || bank.length > 80 || !isDay(dueDate)) {
        return { ok: false, error: t.check };
      }
    }
    if (method === "WITHHOLDING") {
      withholdingType = read(`withholding_${i}`) as WithholdingType;
      if (!WITHHOLDING_TYPES.includes(withholdingType)) {
        return { ok: false, error: t.withholding };
      }
    }
    lines.push({
      method,
      amount: fromCents(toCents(amount)),
      reference: reference || null,
      bank,
      dueDate,
      withholdingType,
    });
    total += toCents(amount);
  }
  return { ok: true, lines, total: fromCents(total) };
}

export type Allocation = { invoiceId: string; amount: string };

/**
 * Cuánto se imputa a cada factura (`alloc_<factura>`): no más de lo que le
 * falta a cada una ni, en total, más de lo disponible. En blanco o 0, nada.
 */
export function parseAllocations(
  formData: FormData,
  invoices: { id: string; outstanding: Numeric }[],
  available: Numeric,
  t: Pick<Messages, "allocation" | "overAllocated">,
): { ok: true; allocations: Allocation[] } | { ok: false; error: string } {
  const allocations: Allocation[] = [];
  let total = ZERO;
  for (const invoice of invoices) {
    const value = formData.get(`alloc_${invoice.id}`);
    const raw = typeof value === "string" ? value.trim() : "";
    if (!raw) continue;
    const amount = parseDecimalInput(raw, PRICE_LIMITS);
    if (amount === null) return { ok: false, error: t.allocation };
    const cents = toCents(amount);
    if (cents === ZERO) continue;
    if (cents > toCents(invoice.outstanding)) {
      return { ok: false, error: t.allocation };
    }
    allocations.push({ invoiceId: invoice.id, amount: fromCents(cents) });
    total += cents;
  }
  if (total > toCents(available)) return { ok: false, error: t.overAllocated };
  return { ok: true, allocations };
}

/**
 * Reparte un importe entre las facturas en el orden dado (la más vieja
 * primero), sin pasarse de lo que le falta a cada una.
 */
export function autoAllocate(
  invoices: { id: string; outstanding: Numeric }[],
  amount: Numeric,
): Allocation[] {
  let left = toCents(amount);
  const allocations: Allocation[] = [];
  for (const invoice of invoices) {
    if (left <= ZERO) break;
    const outstanding = toCents(invoice.outstanding);
    if (outstanding <= ZERO) continue;
    const take = outstanding < left ? outstanding : left;
    allocations.push({ invoiceId: invoice.id, amount: fromCents(take) });
    left -= take;
  }
  return allocations;
}

export type AccountInvoice = {
  id: string;
  state: SupplierInvoiceState;
  total: Numeric;
  /** YYYY-MM-DD. */
  issueDate: string;
  dueDate: string | null;
};

export type AccountDocument = {
  total: Numeric;
  annulled: boolean;
  /** Lo imputado por este comprobante (solo cuenta si no está anulado). */
  allocations: { invoiceId: string; amount: Numeric }[];
};

export type InvoiceBalance = {
  id: string;
  paid: string;
  outstanding: string;
  /** Vence (o venció, sin vencimiento cuenta la fecha de la factura). */
  dueOn: string;
  overdue: boolean;
};

export type SupplierAccountSummary = {
  /** Facturas aprobadas − OP − notas de crédito (sin anuladas). */
  balance: string;
  /** Lo que se debe de las facturas aprobadas, factura por factura. */
  invoices: InvoiceBalance[];
  overdue: string;
  dueSoon: string;
  /** Pagado o acreditado sin imputar a ninguna factura. */
  unallocated: string;
  /** Facturas observadas: no se pagan hasta aprobarlas. */
  flagged: string;
};

/**
 * La cuenta de un proveedor. Solo las facturas aprobadas son deuda; las
 * observadas se informan aparte. Lo imputado de comprobantes anulados no
 * cuenta. Vencida: con saldo y vencimiento anterior a hoy.
 */
export function summarizeSupplierAccount(
  input: {
    invoices: AccountInvoice[];
    payments: AccountDocument[];
    creditNotes: AccountDocument[];
  },
  today: string,
): SupplierAccountSummary {
  const soon = addDays(today, DUE_SOON_DAYS);
  const documents = [...input.payments, ...input.creditNotes].filter(
    (document) => !document.annulled,
  );
  const paidByInvoice = new Map<string, bigint>();
  let allocated = ZERO;
  let credited = ZERO;
  for (const document of documents) {
    credited += toCents(document.total);
    for (const allocation of document.allocations) {
      const cents = toCents(allocation.amount);
      allocated += cents;
      paidByInvoice.set(
        allocation.invoiceId,
        (paidByInvoice.get(allocation.invoiceId) ?? ZERO) + cents,
      );
    }
  }

  let invoiced = ZERO;
  let flagged = ZERO;
  let overdue = ZERO;
  let dueSoon = ZERO;
  const invoices: InvoiceBalance[] = [];
  for (const invoice of input.invoices) {
    if (invoice.state === "FLAGGED") flagged += toCents(invoice.total);
    if (invoice.state !== "APPROVED") continue;
    const total = toCents(invoice.total);
    const paid = paidByInvoice.get(invoice.id) ?? ZERO;
    const outstanding = total - paid;
    const dueOn = invoice.dueDate ?? invoice.issueDate;
    const isOverdue = outstanding > ZERO && dueOn < today;
    invoiced += total;
    if (isOverdue) overdue += outstanding;
    else if (outstanding > ZERO && dueOn <= soon) dueSoon += outstanding;
    invoices.push({
      id: invoice.id,
      paid: fromCents(paid),
      outstanding: fromCents(outstanding),
      dueOn,
      overdue: isOverdue,
    });
  }
  return {
    balance: fromCents(invoiced - credited),
    invoices,
    overdue: fromCents(overdue),
    dueSoon: fromCents(dueSoon),
    unallocated: fromCents(credited - allocated),
    flagged: fromCents(flagged),
  };
}

/** Lo que le queda sin imputar a una OP o nota de crédito. */
export function unallocatedOf(document: AccountDocument): string {
  if (document.annulled) return "0.00";
  const allocated = document.allocations.reduce(
    (sum, allocation) => sum + toCents(allocation.amount),
    ZERO,
  );
  return fromCents(toCents(document.total) - allocated);
}

function addDays(day: string, days: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export type CreditNoteAmounts = {
  subTotal: string;
  tax: string;
  total: string;
  notes: string | null;
};

/** Neto e IVA de la nota de crédito (el total es la suma) y el comentario. */
export function parseCreditNoteAmounts(
  formData: FormData,
  t: Dictionary["creditNotes"]["errors"],
): { ok: true; data: CreditNoteAmounts } | { ok: false; error: string } {
  const read = (key: string) => {
    const value = formData.get(key);
    return typeof value === "string" ? value.trim() : "";
  };
  const subTotal = parseDecimalInput(read("subTotal"), PRICE_LIMITS);
  const taxRaw = read("tax");
  const tax = taxRaw ? parseDecimalInput(taxRaw, PRICE_LIMITS) : "0";
  if (subTotal === null || tax === null) return { ok: false, error: t.amount };
  const total = toCents(subTotal) + toCents(tax);
  if (total === ZERO) return { ok: false, error: t.amount };
  const notes = read("notes");
  if (notes.length > PAYMENT_NOTES_MAX_LENGTH) {
    return {
      ok: false,
      error: interpolate(t.tooLong, { max: PAYMENT_NOTES_MAX_LENGTH }),
    };
  }
  return {
    ok: true,
    data: {
      subTotal: fromCents(toCents(subTotal)),
      tax: fromCents(toCents(tax)),
      total: fromCents(total),
      notes: notes || null,
    },
  };
}

/** Fecha de pago y comentario de la OP. */
export function parsePaymentHeader(
  formData: FormData,
  t: Pick<Messages, "paidOn" | "tooLong">,
):
  | { ok: true; data: { paidOn: string; notes: string | null } }
  | { ok: false; error: string } {
  const read = (key: string) => {
    const value = formData.get(key);
    return typeof value === "string" ? value.trim() : "";
  };
  const paidOn = read("paidOn");
  if (!isDay(paidOn)) return { ok: false, error: t.paidOn };
  const notes = read("notes");
  if (notes.length > PAYMENT_NOTES_MAX_LENGTH) {
    return {
      ok: false,
      error: interpolate(t.tooLong, { max: PAYMENT_NOTES_MAX_LENGTH }),
    };
  }
  return { ok: true, data: { paidOn, notes: notes || null } };
}
