"use client";

import { useActionState, useState } from "react";
import {
  createCreditNote,
  type CreditNoteActionState,
} from "@/app/[lang]/admin/credit-notes/actions";
import {
  createSupplierPayment,
  type SupplierPaymentActionState,
} from "@/app/[lang]/admin/supplier-payments/actions";
import { useFieldValues } from "@/components/purchases/use-field-values";
import { buttonClass } from "@/components/ui/button";
import { Field, FormError, Input, SubmitButton } from "@/components/ui/form";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/es";
import { formatters } from "@/i18n/format";
import { fromCents, toCents } from "@/lib/account";
import { parseDecimalInput, PRICE_LIMITS } from "@/lib/decimal-input";
import {
  autoAllocate,
  MAX_PAYMENT_LINES,
  PAYMENT_METHODS,
  PAYMENT_NOTES_MAX_LENGTH,
  WITHHOLDING_TYPES,
} from "@/lib/supplier-account";
import { INVOICE_TYPES } from "@/lib/supplier-invoice";

const CONTROL = "rounded border border-current/20 bg-transparent px-2 py-1";
const SELECT = "rounded border border-current/20 bg-transparent px-3 py-2";
const ZERO = BigInt(0);

export type OpenInvoiceRow = {
  id: string;
  label: string;
  /** Ya formateado. */
  due: string;
  overdue: boolean;
  /** Saldo como decimal ("35000.00") y formateado. */
  outstanding: string;
  outstandingLabel: string;
};

type Fields = ReturnType<typeof useFieldValues>;
type PaymentTexts = Dictionary["supplierPayments"];

/** Centavos de lo tipeado (en blanco o inválido, 0). */
function cents(raw: string): bigint {
  const parsed = raw.trim() ? parseDecimalInput(raw, PRICE_LIMITS) : null;
  return parsed === null ? ZERO : toCents(parsed);
}

/**
 * Cuánto se imputa a cada factura (`alloc_<factura>`), con lo imputado y lo
 * que queda a cuenta en vivo, y un botón que reparte lo disponible empezando
 * por la factura preferida (la de la nota de crédito) y siguiendo por la más vieja.
 */
function AllocationTable({
  invoices,
  available,
  fields,
  preferId,
  locale,
  t,
}: {
  invoices: OpenInvoiceRow[];
  /** Centavos disponibles para imputar. */
  available: bigint;
  fields: Fields;
  preferId?: string;
  locale: Locale;
  t: PaymentTexts;
}) {
  const format = formatters(locale);
  const c = t.columns;
  if (invoices.length === 0) return null;
  const allocated = invoices.reduce(
    (sum, invoice) => sum + cents(fields.value(`alloc_${invoice.id}`)),
    ZERO,
  );
  const onAccount = available - allocated;
  const fill = () => {
    const ordered = [
      ...invoices.filter((invoice) => invoice.id === preferId),
      ...invoices.filter((invoice) => invoice.id !== preferId),
    ];
    const plan = autoAllocate(ordered, fromCents(available));
    fields.setMany(
      Object.fromEntries(
        invoices.map((invoice) => {
          const amount = plan.find((row) => row.invoiceId === invoice.id);
          return [
            `alloc_${invoice.id}`,
            amount ? format.input(amount.amount) : "",
          ];
        }),
      ),
    );
  };

  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-medium">{t.allocationsTitle}</h2>
        <button
          type="button"
          onClick={fill}
          className={buttonClass("secondary")}
        >
          {t.autoAllocate}
        </button>
      </div>
      <p className="opacity-70">{t.allocationsHint}</p>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="border-b border-current/20">
            <tr>
              <th className="py-2 pr-3 font-medium">{c.invoice}</th>
              <th className="py-2 pr-3 font-medium">{c.due}</th>
              <th className="py-2 pr-3 text-right font-medium">
                {c.outstanding}
              </th>
              <th className="py-2 font-medium">{c.allocate}</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((invoice) => (
              <tr key={invoice.id} className="border-b border-current/10">
                <td className="py-2 pr-3 font-mono">{invoice.label}</td>
                <td
                  className={`py-2 pr-3 whitespace-nowrap ${invoice.overdue ? "text-red-600" : ""}`}
                >
                  {invoice.due}
                </td>
                <td className="py-2 pr-3 text-right whitespace-nowrap">
                  {invoice.outstandingLabel}
                </td>
                <td className="py-2">
                  <input
                    {...fields.bind(`alloc_${invoice.id}`)}
                    inputMode="decimal"
                    aria-label={`${c.allocate} ${invoice.label}`}
                    className={`${CONTROL} w-32`}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <dl className="ml-auto flex w-full max-w-xs flex-col gap-1">
        <div className="flex justify-between">
          <dt className="opacity-70">{t.allocated}</dt>
          <dd>{format.money(fromCents(allocated))}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="opacity-70">{t.onAccount}</dt>
          <dd className={onAccount < ZERO ? "text-red-600" : ""}>
            {format.money(fromCents(onAccount))}
          </dd>
        </div>
      </dl>
    </section>
  );
}

/** Nueva orden de pago: fecha, medios (varios) e imputación a facturas. */
export function PaymentForm({
  supplierId,
  invoices,
  today,
  locale,
  t,
}: {
  supplierId: string;
  invoices: OpenInvoiceRow[];
  today: string;
  locale: Locale;
  t: PaymentTexts;
}) {
  const [state, action, pending] = useActionState<
    SupplierPaymentActionState,
    FormData
  >(createSupplierPayment.bind(null, supplierId), {});
  const fields = useFieldValues({ paidOn: today, "method@0": "TRANSFER" });
  // Ids estables de los medios; los campos se numeran por posición al enviar.
  const [rows, setRows] = useState([0]);
  const [nextId, setNextId] = useState(1);
  const format = formatters(locale);

  const field = (id: number, index: number, key: string) => ({
    name: `${key}_${index}`,
    value: fields.value(`${key}@${id}`),
    onChange: (event: { target: { value: string } }) =>
      fields.setMany({ [`${key}@${id}`]: event.target.value }),
  });
  const total = rows.reduce(
    (sum, id) => sum + cents(fields.value(`amount@${id}`)),
    ZERO,
  );

  return (
    <form action={action} className="flex flex-col gap-6 text-sm">
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={t.paidOn}>
          <Input type="date" {...fields.bind("paidOn")} required />
        </Field>
        <div className="sm:col-span-2">
          <Field label={t.notesOptional}>
            <Input
              {...fields.bind("notes")}
              maxLength={PAYMENT_NOTES_MAX_LENGTH}
            />
          </Field>
        </div>
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">{t.methodsTitle}</h2>
        <input type="hidden" name="lines" value={rows.length} />
        {rows.map((id, index) => {
          const method = fields.value(`method@${id}`) || "CASH";
          return (
            <div
              key={id}
              className="flex flex-wrap items-end gap-3 rounded border border-current/20 p-3"
            >
              <Field label={t.method}>
                <select {...field(id, index, "method")} className={SELECT}>
                  {PAYMENT_METHODS.map((option) => (
                    <option key={option} value={option}>
                      {t.methods[option]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t.amount}>
                <Input
                  {...field(id, index, "amount")}
                  inputMode="decimal"
                  required
                  className="w-36"
                />
              </Field>
              {method === "WITHHOLDING" && (
                <Field label={t.withholdingType}>
                  <select
                    {...field(id, index, "withholding")}
                    required
                    className={SELECT}
                  >
                    <option value="" />
                    {WITHHOLDING_TYPES.map((option) => (
                      <option key={option} value={option}>
                        {t.withholdingTypes[option]}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              {method !== "CASH" && (
                <Field label={t.reference[method as keyof typeof t.reference]}>
                  <Input
                    {...field(id, index, "reference")}
                    maxLength={50}
                    required
                  />
                </Field>
              )}
              {method === "CHECK" && (
                <>
                  <Field label={t.bank}>
                    <Input
                      {...field(id, index, "bank")}
                      maxLength={80}
                      required
                    />
                  </Field>
                  <Field label={t.checkDate}>
                    <Input type="date" {...field(id, index, "due")} required />
                  </Field>
                </>
              )}
              {rows.length > 1 && (
                <button
                  type="button"
                  onClick={() => setRows(rows.filter((row) => row !== id))}
                  className="mb-2 text-red-600 hover:underline"
                >
                  {t.removeMethod}
                </button>
              )}
            </div>
          );
        })}
        <div className="flex items-baseline justify-between">
          {rows.length < MAX_PAYMENT_LINES && (
            <button
              type="button"
              onClick={() => {
                setRows([...rows, nextId]);
                fields.setMany({ [`method@${nextId}`]: "CASH" });
                setNextId(nextId + 1);
              }}
              className="hover:underline"
            >
              {t.addMethod}
            </button>
          )}
          <p className="font-semibold">
            {t.total}: {format.money(fromCents(total))}
          </p>
        </div>
      </section>

      <AllocationTable
        invoices={invoices}
        available={total}
        fields={fields}
        locale={locale}
        t={t}
      />

      <FormError messages={state.error} />
      <div>
        <SubmitButton pending={pending} pendingLabel={t.saving}>
          {t.save}
        </SubmitButton>
      </div>
    </form>
  );
}

/** Nueva nota de crédito: comprobante, factura asociada, importes e imputación. */
export function CreditNoteForm({
  supplierId,
  invoices,
  invoiceOptions,
  invoiceId,
  today,
  locale,
  t,
  paymentTexts,
}: {
  supplierId: string;
  invoices: OpenInvoiceRow[];
  /** Facturas sin anular del proveedor, para asociar. */
  invoiceOptions: { id: string; label: string }[];
  invoiceId: string;
  today: string;
  locale: Locale;
  t: Dictionary["creditNotes"];
  paymentTexts: PaymentTexts;
}) {
  const [state, action, pending] = useActionState<
    CreditNoteActionState,
    FormData
  >(createCreditNote.bind(null, supplierId), {});
  const fields = useFieldValues({ type: "A", issueDate: today, invoiceId });
  const format = formatters(locale);
  const total = cents(fields.value("subTotal")) + cents(fields.value("tax"));

  return (
    <form action={action} className="flex flex-col gap-6 text-sm">
      <div className="grid gap-4 sm:grid-cols-4">
        <Field label={t.type}>
          <select {...fields.bind("type")} className={SELECT}>
            {INVOICE_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t.pointOfSale}>
          <Input
            {...fields.bind("pointOfSale")}
            inputMode="numeric"
            maxLength={5}
            required
          />
        </Field>
        <Field label={t.number}>
          <Input
            {...fields.bind("number")}
            inputMode="numeric"
            maxLength={8}
            required
          />
        </Field>
        <Field label={t.issueDate}>
          <Input
            type="date"
            {...fields.bind("issueDate")}
            max={today}
            required
          />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-4">
        <Field label={t.invoice}>
          <select {...fields.bind("invoiceId")} className={SELECT}>
            <option value="">{t.noInvoice}</option>
            {invoiceOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t.subTotal}>
          <Input {...fields.bind("subTotal")} inputMode="decimal" required />
        </Field>
        <Field label={t.tax}>
          <Input {...fields.bind("tax")} inputMode="decimal" />
        </Field>
        <div className="flex flex-col justify-end pb-2 font-semibold">
          {t.total}: {format.money(fromCents(total))}
        </div>
      </div>
      <Field label={t.notesOptional}>
        <Input {...fields.bind("notes")} maxLength={PAYMENT_NOTES_MAX_LENGTH} />
      </Field>

      <AllocationTable
        invoices={invoices}
        available={total}
        fields={fields}
        preferId={fields.value("invoiceId")}
        locale={locale}
        t={paymentTexts}
      />

      <FormError messages={state.error} />
      <div>
        <SubmitButton pending={pending} pendingLabel={t.saving}>
          {t.save}
        </SubmitButton>
      </div>
    </form>
  );
}

/** Imputa lo que quedó a cuenta de una OP o nota de crédito ya cargada. */
export function AllocateForm({
  action,
  invoices,
  available,
  title,
  locale,
  t,
}: {
  action: (
    prev: { error?: string },
    formData: FormData,
  ) => Promise<{ error?: string }>;
  invoices: OpenInvoiceRow[];
  /** Disponible como decimal ("10000.00"). */
  available: string;
  title: string;
  locale: Locale;
  t: PaymentTexts;
}) {
  const [state, formAction, pending] = useActionState<
    { error?: string },
    FormData
  >(action, {});
  const fields = useFieldValues({});
  return (
    <details className="text-sm">
      <summary className="cursor-pointer hover:underline">{title}</summary>
      <form action={formAction} className="mt-3 flex flex-col gap-3">
        <AllocationTable
          invoices={invoices}
          available={toCents(available)}
          fields={fields}
          locale={locale}
          t={t}
        />
        <FormError messages={state.error} />
        <div>
          <SubmitButton pending={pending} pendingLabel={t.working}>
            {t.allocateSave}
          </SubmitButton>
        </div>
      </form>
    </details>
  );
}
