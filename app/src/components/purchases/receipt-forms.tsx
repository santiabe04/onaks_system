"use client";

import { useActionState } from "react";
import {
  createGoodsReceipt,
  type ReceiptActionState,
} from "@/app/[lang]/admin/receipts/actions";
import { Field, FormError, Input, SubmitButton } from "@/components/ui/form";
import { DifferenceLabel } from "@/components/purchases/difference-label";
import {
  submitWithoutReset,
  useFieldValues,
} from "@/components/ui/use-field-values";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/es";
import { formatters } from "@/i18n/format";
import { parseDecimalInput } from "@/lib/decimal-input";
import {
  DELIVERY_NOTE_MAX_LENGTH,
  RECEIPT_NOTES_MAX_LENGTH,
  receiptDifference,
} from "@/lib/goods-receipt";
import { QUANTITY_LIMITS, toMilli } from "@/lib/quantity";

const CONTROL = "rounded border border-current/20 bg-transparent px-2 py-1";

export type ReceiptFormLine = {
  productId: string;
  name: string;
  sku: string;
  unit: string;
  allowsDecimals: boolean;
  /** Ya formateados para mostrar. */
  ordered: string;
  receivedBefore: string;
  pendingLabel: string;
  /** Pendiente como decimal ("8", "2.5"), para la diferencia en vivo. */
  pending: string;
  /** Valor inicial del input (separador decimal del idioma). */
  initial: string;
};

/** Lo tipeado ("2,5") como decimal, solo para mostrar la diferencia; el server valida. */
function typed(raw: string): string | null {
  if (!raw.trim()) return "0";
  return parseDecimalInput(raw, QUANTITY_LIMITS);
}

function LineDifference({
  pending,
  value,
  t,
  format,
}: {
  pending: string;
  value: string | null;
  t: Dictionary["receipts"];
  format: ReturnType<typeof formatters>;
}) {
  if (value === null) return <span className="opacity-50">—</span>;
  return (
    <DifferenceLabel
      diff={receiptDifference(pending, value)}
      t={t}
      format={format}
    />
  );
}

/** El informe de recepción: depósito, remito y lo que llegó de cada producto. */
export function ReceiptForm({
  orderId,
  warehouses,
  lines,
  locale,
  t,
}: {
  orderId: string;
  warehouses: { id: string; name: string }[];
  lines: ReceiptFormLine[];
  locale: Locale;
  t: Dictionary["receipts"];
}) {
  const [state, action, pending] = useActionState<ReceiptActionState, FormData>(
    createGoodsReceipt.bind(null, orderId),
    {},
  );
  const { value, bind } = useFieldValues({
    warehouseId: warehouses.length === 1 ? warehouses[0].id : "",
    ...Object.fromEntries(
      lines.map((line) => [`rcv_${line.productId}`, line.initial]),
    ),
  });
  const format = formatters(locale);
  const c = t.columns;
  const over = lines.some((line) => {
    const received = typed(value(`rcv_${line.productId}`));
    return received !== null && toMilli(received) > toMilli(line.pending);
  });

  return (
    <form
      onSubmit={submitWithoutReset(action)}
      className="flex flex-col gap-4 text-sm"
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={t.warehouse}>
          <select
            {...bind("warehouseId")}
            required
            className="rounded border border-current/20 bg-transparent px-3 py-2"
          >
            <option value="" disabled>
              {t.chooseWarehouse}
            </option>
            {warehouses.map((warehouse) => (
              <option key={warehouse.id} value={warehouse.id}>
                {warehouse.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t.deliveryNote}>
          <Input
            {...bind("deliveryNote")}
            maxLength={DELIVERY_NOTE_MAX_LENGTH}
          />
        </Field>
        <Field label={t.notesOptional}>
          <Input {...bind("notes")} maxLength={RECEIPT_NOTES_MAX_LENGTH} />
        </Field>
      </div>

      <p className="opacity-70">{t.linesHint}</p>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="border-b border-current/20">
            <tr>
              <th className="py-2 pr-3 font-medium">{c.product}</th>
              <th className="py-2 pr-3 text-right font-medium">{c.ordered}</th>
              <th className="py-2 pr-3 text-right font-medium">
                {c.receivedBefore}
              </th>
              <th className="py-2 pr-3 text-right font-medium">{c.pending}</th>
              <th className="py-2 pr-3 font-medium">{c.quantity}</th>
              <th className="py-2 font-medium">{c.difference}</th>
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
                  {line.ordered}
                </td>
                <td className="py-2 pr-3 text-right whitespace-nowrap">
                  {line.receivedBefore}
                </td>
                <td className="py-2 pr-3 text-right font-semibold whitespace-nowrap">
                  {line.pendingLabel}
                </td>
                <td className="py-2 pr-3">
                  <span className="flex items-center gap-1">
                    <input
                      {...bind(`rcv_${line.productId}`)}
                      inputMode={line.allowsDecimals ? "decimal" : "numeric"}
                      aria-label={`${c.quantity} ${line.name}`}
                      className={`${CONTROL} w-20`}
                    />
                    <span className="text-xs opacity-70">{line.unit}</span>
                  </span>
                </td>
                <td className="py-2 whitespace-nowrap">
                  <LineDifference
                    pending={line.pending}
                    value={typed(value(`rcv_${line.productId}`))}
                    t={t}
                    format={format}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {over && (
        <p role="status" className="text-amber-700 dark:text-amber-400">
          ⚠ {t.overWarning}
        </p>
      )}
      <FormError messages={state.error} />
      <div>
        <SubmitButton pending={pending} pendingLabel={t.saving}>
          {t.confirm}
        </SubmitButton>
      </div>
    </form>
  );
}

/**
 * Una acción con motivo obligatorio (anular un informe o una factura, cerrar
 * una OC con faltante, aprobar una factura observada), plegada hasta que se la pide.
 */
export function ReasonForm({
  action,
  label,
  hint,
  reasonLabel,
  pendingLabel,
  maxLength,
  tone = "danger",
}: {
  action: (
    prev: ReceiptActionState,
    formData: FormData,
  ) => Promise<ReceiptActionState>;
  label: string;
  hint: string;
  reasonLabel: string;
  pendingLabel: string;
  maxLength: number;
  /** Rojo para anular; neutro para aprobar. */
  tone?: "danger" | "neutral";
}) {
  const color = tone === "danger" ? "text-red-600" : "";
  const [state, formAction, pending] = useActionState<
    ReceiptActionState,
    FormData
  >(action, {});
  return (
    <details className="text-sm">
      <summary className={`cursor-pointer hover:underline ${color}`}>
        {label}
      </summary>
      <form action={formAction} className="mt-2 flex max-w-md flex-col gap-2">
        <p className="text-xs opacity-70">{hint}</p>
        <input
          name="reason"
          required
          maxLength={maxLength}
          placeholder={reasonLabel}
          aria-label={reasonLabel}
          className={CONTROL}
        />
        <FormError messages={state.error} />
        <button
          type="submit"
          disabled={pending}
          className={`self-start hover:underline disabled:opacity-50 ${color}`}
        >
          {pending ? pendingLabel : label}
        </button>
      </form>
    </details>
  );
}
