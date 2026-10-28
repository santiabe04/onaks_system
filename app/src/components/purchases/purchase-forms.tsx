"use client";

import { useActionState, useState } from "react";
import {
  createPurchaseOrder,
  savePurchaseOrder,
  type PurchaseActionState,
} from "@/app/[lang]/admin/purchases/actions";
import { buttonClass } from "@/components/ui/button";
import { Field, FormError, Input, SubmitButton } from "@/components/ui/form";
import type { Dictionary } from "@/i18n/dictionaries/es";
import { PO_NOTES_MAX_LENGTH } from "@/lib/purchase-order";

const CONTROL = "rounded border border-current/20 bg-transparent px-2 py-1";

/** Elegir el proveedor y crear el borrador. */
export function NewPurchaseForm({
  suppliers,
  t,
}: {
  suppliers: { id: string; name: string }[];
  t: Dictionary["purchases"];
}) {
  const [state, action, pending] = useActionState<
    PurchaseActionState,
    FormData
  >(createPurchaseOrder, {});
  return (
    <form action={action} className="flex flex-col gap-4 text-sm">
      <Field label={t.supplier}>
        <select
          name="supplierId"
          required
          defaultValue=""
          className="rounded border border-current/20 bg-transparent px-3 py-2"
        >
          <option value="" disabled>
            {t.chooseSupplier}
          </option>
          {suppliers.map((supplier) => (
            <option key={supplier.id} value={supplier.id}>
              {supplier.name}
            </option>
          ))}
        </select>
      </Field>
      <FormError messages={state.error} />
      <div>
        <SubmitButton pending={pending} pendingLabel={t.working}>
          {t.create}
        </SubmitButton>
      </div>
    </form>
  );
}

export type EditorLine = {
  productId: string;
  name: string;
  sku: string;
  supplierCode: string | null;
  unit: string;
  allowsDecimals: boolean;
  /** Ya formateados para mostrar. */
  stock: string;
  reserved: string;
  minStock: string;
  onOrder: string;
  suggested: string;
  /** Valores iniciales de los inputs (separador decimal del idioma). */
  quantity: string;
  unitCost: string;
};

/** El borrador: fecha esperada, comentario y cantidad / costo por producto. */
export function PurchaseEditor({
  orderId,
  lines,
  expectedDate,
  notes,
  today,
  t,
}: {
  orderId: string;
  lines: EditorLine[];
  expectedDate: string;
  notes: string;
  today: string;
  t: Dictionary["purchases"];
}) {
  const [state, action, pending] = useActionState<
    PurchaseActionState,
    FormData
  >(savePurchaseOrder.bind(null, orderId), {});
  const c = t.columns;

  return (
    <form action={action} className="flex flex-col gap-4 text-sm">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t.expectedDate}>
          <Input
            type="date"
            name="expectedDate"
            min={today}
            defaultValue={expectedDate}
          />
        </Field>
        <Field label={t.notesOptional}>
          <Input
            name="notes"
            maxLength={PO_NOTES_MAX_LENGTH}
            defaultValue={notes}
          />
        </Field>
      </div>

      <p className="opacity-70">{t.linesHint}</p>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="border-b border-current/20">
            <tr>
              <th className="py-2 pr-3 font-medium">{c.product}</th>
              <th className="py-2 pr-3 text-right font-medium">{c.stock}</th>
              <th className="py-2 pr-3 text-right font-medium">{c.reserved}</th>
              <th className="py-2 pr-3 text-right font-medium">{c.minStock}</th>
              <th className="py-2 pr-3 text-right font-medium">{c.onOrder}</th>
              <th className="py-2 pr-3 text-right font-medium">
                {c.suggested}
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
                    {line.supplierCode && ` · ${line.supplierCode}`}
                  </span>
                </td>
                <td className="py-2 pr-3 text-right whitespace-nowrap">
                  {line.stock}
                </td>
                <td className="py-2 pr-3 text-right whitespace-nowrap">
                  {line.reserved}
                </td>
                <td className="py-2 pr-3 text-right whitespace-nowrap">
                  {line.minStock}
                </td>
                <td className="py-2 pr-3 text-right whitespace-nowrap">
                  {line.onOrder}
                </td>
                <td className="py-2 pr-3 text-right font-semibold whitespace-nowrap">
                  {line.suggested}
                </td>
                <td className="py-2 pr-3">
                  <span className="flex items-center gap-1">
                    <input
                      name={`qty_${line.productId}`}
                      inputMode={line.allowsDecimals ? "decimal" : "numeric"}
                      defaultValue={line.quantity}
                      aria-label={`${c.quantity} ${line.name}`}
                      className={`${CONTROL} w-20`}
                    />
                    <span className="text-xs opacity-70">{line.unit}</span>
                  </span>
                </td>
                <td className="py-2">
                  <input
                    name={`cost_${line.productId}`}
                    inputMode="decimal"
                    defaultValue={line.unitCost}
                    aria-label={`${c.unitCost} ${line.name}`}
                    className={`${CONTROL} w-28`}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <FormError messages={state.error} />
      {state.savedAt && !state.error && (
        <p role="status" className="text-green-700 dark:text-green-400">
          ✓ {t.saved}
        </p>
      )}
      <div>
        <SubmitButton pending={pending} pendingLabel={t.saving}>
          {t.save}
        </SubmitButton>
      </div>
    </form>
  );
}

/**
 * Copia un texto (la OC para WhatsApp) al portapapeles. Si el navegador no
 * deja (permisos, http), muestra el texto para copiarlo a mano.
 */
export function CopyTextButton({
  text,
  label,
  copiedLabel,
}: {
  text: string;
  label: string;
  copiedLabel: string;
}) {
  const [status, setStatus] = useState<"idle" | "copied" | "manual">("idle");
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        className={buttonClass("secondary")}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setStatus("copied");
            setTimeout(() => setStatus("idle"), 2000);
          } catch {
            setStatus("manual");
          }
        }}
      >
        {status === "copied" ? `✓ ${copiedLabel}` : label}
      </button>
      {status === "manual" && (
        <textarea
          readOnly
          value={text}
          rows={Math.min(12, text.split("\n").length)}
          aria-label={label}
          onFocus={(event) => event.currentTarget.select()}
          autoFocus
          className="w-full max-w-md rounded border border-current/20 bg-transparent p-2 text-sm"
        />
      )}
    </div>
  );
}
