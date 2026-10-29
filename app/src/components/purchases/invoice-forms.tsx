"use client";

import { useActionState } from "react";
import {
  createSupplierInvoice,
  type InvoiceActionState,
} from "@/app/[lang]/admin/invoices/actions";
import { useFieldValues } from "@/components/purchases/use-field-values";
import { Field, FormError, Input, SubmitButton } from "@/components/ui/form";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/es";
import { formatters } from "@/i18n/format";
import { toCents } from "@/lib/account";
import { parseDecimalInput, PRICE_LIMITS } from "@/lib/decimal-input";
import { QUANTITY_LIMITS } from "@/lib/quantity";
import {
  INVOICE_NOTES_MAX_LENGTH,
  INVOICE_TYPES,
  invoiceTotals,
} from "@/lib/supplier-invoice";

const CONTROL = "rounded border border-current/20 bg-transparent px-2 py-1";
const TAX_FIELDS = ["vatPerception", "iibbPerception", "otherTaxes"] as const;

export type InvoiceFormLine = {
  productId: string;
  name: string;
  sku: string;
  unit: string;
  allowsDecimals: boolean;
  /** Alícuota de la OC (fracción), para los totales en vivo. */
  taxRate: string;
  /** Ya formateados para mostrar. */
  received: string;
  invoicedBefore: string;
  pending: string;
  orderCost: string;
  /** Valores iniciales de los inputs (separador decimal del idioma). */
  quantity: string;
  unitCost: string;
};

/** Lo tipeado como decimal (en blanco = 0); null si no es un número válido. */
function typed(raw: string, limits = PRICE_LIMITS): string | null {
  if (!raw.trim()) return "0";
  return parseDecimalInput(raw, limits);
}

/** La factura del proveedor: comprobante, líneas, percepciones y total impreso. */
export function InvoiceForm({
  orderId,
  lines,
  today,
  locale,
  t,
}: {
  orderId: string;
  lines: InvoiceFormLine[];
  today: string;
  locale: Locale;
  t: Dictionary["invoices"];
}) {
  const [state, action, pending] = useActionState<InvoiceActionState, FormData>(
    createSupplierInvoice.bind(null, orderId),
    {},
  );
  const { value, bind } = useFieldValues({
    type: "A",
    issueDate: today,
    ...Object.fromEntries(
      lines.flatMap((line) => [
        [`qty_${line.productId}`, line.quantity],
        [`cost_${line.productId}`, line.unitCost],
      ]),
    ),
  });
  const format = formatters(locale);
  const c = t.columns;

  // Totales en vivo con la misma cuenta que el server (solo para mostrar).
  const parsedLines = lines.map((line) => ({
    quantity: typed(value(`qty_${line.productId}`), QUANTITY_LIMITS),
    unitCost: typed(value(`cost_${line.productId}`)),
    taxRate: line.taxRate,
  }));
  const taxes = TAX_FIELDS.map((field) => typed(value(field)));
  const valid =
    parsedLines.every(
      (line) => line.quantity !== null && line.unitCost !== null,
    ) && taxes.every((amount) => amount !== null);
  const totals = valid
    ? invoiceTotals(
        parsedLines.map((line) => ({
          quantity: line.quantity!,
          unitCost: line.unitCost!,
          taxRate: line.taxRate,
        })),
        {
          vatPerception: taxes[0]!,
          iibbPerception: taxes[1]!,
          otherTaxes: taxes[2]!,
        },
      )
    : null;
  const printed = value("printedTotal").trim()
    ? typed(value("printedTotal"))
    : null;
  const mismatch =
    totals !== null &&
    printed !== null &&
    toCents(printed) !== toCents(totals.total);

  return (
    <form action={action} className="flex flex-col gap-4 text-sm">
      <div className="grid gap-4 sm:grid-cols-5">
        <Field label={t.type}>
          <select
            {...bind("type")}
            className="rounded border border-current/20 bg-transparent px-3 py-2"
          >
            {INVOICE_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t.pointOfSale}>
          <Input
            {...bind("pointOfSale")}
            inputMode="numeric"
            maxLength={5}
            required
          />
        </Field>
        <Field label={t.number}>
          <Input
            {...bind("number")}
            inputMode="numeric"
            maxLength={8}
            required
          />
        </Field>
        <Field label={t.issueDate}>
          <Input type="date" {...bind("issueDate")} max={today} required />
        </Field>
        <Field label={t.dueDate}>
          <Input type="date" {...bind("dueDate")} />
        </Field>
      </div>

      <p className="opacity-70">{t.linesHint}</p>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="border-b border-current/20">
            <tr>
              <th className="py-2 pr-3 font-medium">{c.product}</th>
              <th className="py-2 pr-3 text-right font-medium">{c.received}</th>
              <th className="py-2 pr-3 text-right font-medium">
                {c.invoicedBefore}
              </th>
              <th className="py-2 pr-3 text-right font-medium">{c.pending}</th>
              <th className="py-2 pr-3 text-right font-medium">
                {c.orderCost}
              </th>
              <th className="py-2 pr-3 font-medium">{c.quantity}</th>
              <th className="py-2 font-medium">{c.unitCost}</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr
                key={line.productId}
                className="border-b border-current/10 align-top"
              >
                <td className="py-2 pr-3">
                  {line.name}
                  <span className="block font-mono text-xs opacity-70">
                    {line.sku}
                  </span>
                </td>
                <td className="py-2 pr-3 text-right whitespace-nowrap">
                  {line.received}
                </td>
                <td className="py-2 pr-3 text-right whitespace-nowrap">
                  {line.invoicedBefore}
                </td>
                <td className="py-2 pr-3 text-right font-semibold whitespace-nowrap">
                  {line.pending}
                </td>
                <td className="py-2 pr-3 text-right whitespace-nowrap">
                  {line.orderCost}
                </td>
                <td className="py-2 pr-3">
                  <span className="flex items-center gap-1">
                    <input
                      {...bind(`qty_${line.productId}`)}
                      inputMode={line.allowsDecimals ? "decimal" : "numeric"}
                      aria-label={`${c.quantity} ${line.name}`}
                      className={`${CONTROL} w-20`}
                    />
                    <span className="text-xs opacity-70">{line.unit}</span>
                  </span>
                </td>
                <td className="py-2">
                  <input
                    {...bind(`cost_${line.productId}`)}
                    inputMode="decimal"
                    aria-label={`${c.unitCost} ${line.name}`}
                    className={`${CONTROL} w-28`}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        {TAX_FIELDS.map((field) => (
          <Field key={field} label={t[field]}>
            <Input {...bind(field)} inputMode="decimal" />
          </Field>
        ))}
        <Field label={t.printedTotal}>
          <Input {...bind("printedTotal")} inputMode="decimal" required />
        </Field>
      </div>

      <dl className="ml-auto flex w-full max-w-xs flex-col gap-1">
        <div className="flex justify-between">
          <dt className="opacity-70">{t.net}</dt>
          <dd>{totals ? format.money(totals.net) : "—"}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="opacity-70">{t.tax}</dt>
          <dd>{totals ? format.money(totals.tax) : "—"}</dd>
        </div>
        <div className="flex justify-between border-t border-current/20 pt-1 font-semibold">
          <dt>{t.total}</dt>
          <dd className={mismatch ? "text-red-600" : ""}>
            {totals ? format.money(totals.total) : "—"}
          </dd>
        </div>
      </dl>
      <p className="text-xs opacity-70">{t.printedTotalHint}</p>

      <Field label={t.notesOptional}>
        <Input {...bind("notes")} maxLength={INVOICE_NOTES_MAX_LENGTH} />
      </Field>
      <FormError messages={state.error} />
      <div>
        <SubmitButton pending={pending} pendingLabel={t.saving}>
          {t.save}
        </SubmitButton>
      </div>
    </form>
  );
}
