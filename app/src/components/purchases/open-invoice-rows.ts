import type { formatters } from "@/i18n/format";
import type { loadSupplierAccount } from "@/lib/supplier-account-ledger";
import { openInvoices } from "@/lib/supplier-account-ledger";
import { formatInvoiceNumber } from "@/lib/supplier-invoice";
import type { OpenInvoiceRow } from "./account-forms";

/** Fecha sin hora al mediodía, para que la zona horaria no cambie el día. */
export function formatDay(
  format: ReturnType<typeof formatters>,
  day: string | Date,
): string {
  const iso = typeof day === "string" ? day : day.toISOString().slice(0, 10);
  return format.date(new Date(`${iso}T12:00:00-03:00`));
}

/** Las facturas con saldo del proveedor, listas para la tabla de imputación. */
export function openInvoiceRows(
  account: Awaited<ReturnType<typeof loadSupplierAccount>>,
  format: ReturnType<typeof formatters>,
): OpenInvoiceRow[] {
  return openInvoices(account).map((row) => ({
    id: row.id,
    label: formatInvoiceNumber(row.invoice),
    due: formatDay(format, row.dueOn),
    overdue: row.overdue,
    outstanding: row.outstanding,
    outstandingLabel: format.money(row.outstanding),
  }));
}
