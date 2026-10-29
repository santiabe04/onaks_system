"use client";

import { useActionState } from "react";
import {
  confirmPickingList,
  createPickingList,
  type PickingActionState,
} from "@/app/[lang]/admin/picking/actions";
import {
  setProductLocation,
  type LocationState,
} from "@/app/[lang]/admin/stock/actions";
import { BULK_FORM_ID } from "@/components/orders/bulk-state-bar";
import {
  submitWithoutReset,
  useFieldValues,
} from "@/components/ui/use-field-values";
import { Field, FormError, Input, SubmitButton } from "@/components/ui/form";
import type { Dictionary } from "@/i18n/dictionaries/es";
import { parseDecimalInput } from "@/lib/decimal-input";
import { PICKING_SHORTAGE_REASONS } from "@/lib/partial-delivery";
import {
  LOCATION_MAX_LENGTH,
  PICKING_NOTES_MAX_LENGTH,
  PREPARER_MAX_LENGTH,
} from "@/lib/picking";
import { QUANTITY_LIMITS, toMilli } from "@/lib/quantity";

const CONTROL = "rounded border border-current/20 bg-transparent px-2 py-1";
const SELECT = "rounded border border-current/20 bg-transparent px-3 py-2";

/**
 * Armar una lista de picking con los pedidos tildados en la tabla (las
 * casillas son del form de la barra masiva: se copian al enviar).
 */
export function PickingFromSelection({
  warehouses,
  t,
}: {
  warehouses: { id: string; name: string }[];
  t: Dictionary["picking"];
}) {
  const [state, formAction, pending] = useActionState<
    PickingActionState,
    FormData
  >(async (prev, formData) => {
    const boxes = document.querySelectorAll<HTMLInputElement>(
      `input[type=checkbox][form=${BULK_FORM_ID}][name=sale]:checked`,
    );
    for (const box of boxes) formData.append("sale", box.value);
    return createPickingList(prev, formData);
  }, {});
  const fields = useFieldValues({
    warehouseId: warehouses.length === 1 ? warehouses[0].id : "",
  });

  return (
    <details className="mt-4 rounded border border-current/20 p-4 text-sm print:hidden">
      <summary className="cursor-pointer font-medium">
        {t.fromSelection}
      </summary>
      <form
        onSubmit={submitWithoutReset(formAction)}
        className="mt-3 flex flex-col gap-4"
      >
        <p className="opacity-70">{t.fromSelectionHint}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t.warehouse}>
            <select {...fields.bind("warehouseId")} required className={SELECT}>
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
          <Field label={t.notesOptional}>
            <Input
              {...fields.bind("notes")}
              maxLength={PICKING_NOTES_MAX_LENGTH}
            />
          </Field>
        </div>
        <FormError messages={state.error} />
        <div>
          <SubmitButton pending={pending} pendingLabel={t.working}>
            {t.create}
          </SubmitButton>
        </div>
      </form>
    </details>
  );
}

export type ConfirmLine = {
  saleId: string;
  saleNumber: number;
  customer: string;
  productId: string;
  name: string;
  unit: string;
  allowsDecimals: boolean;
  /** Lo pedido como decimal ("3", "2.5") y formateado para el input. */
  quantity: string;
  quantityInput: string;
  quantityLabel: string;
};

/**
 * Lo preparado por pedido y producto (se precarga lo pedido). Si falta algo,
 * aparece el motivo.
 */
export function ConfirmPickingForm({
  listId,
  lines,
  t,
}: {
  listId: string;
  lines: ConfirmLine[];
  t: Dictionary["picking"];
}) {
  const [state, action, pending] = useActionState<PickingActionState, FormData>(
    confirmPickingList.bind(null, listId),
    {},
  );
  const key = (line: ConfirmLine) => `${line.saleId}_${line.productId}`;
  const fields = useFieldValues(
    Object.fromEntries(
      lines.map((line) => [`picked_${key(line)}`, line.quantityInput]),
    ),
  );
  const c = t.columns;
  const short = (line: ConfirmLine) => {
    const parsed = parseDecimalInput(
      fields.value(`picked_${key(line)}`),
      QUANTITY_LIMITS,
    );
    return parsed !== null && toMilli(parsed) < toMilli(line.quantity);
  };

  return (
    <form
      onSubmit={submitWithoutReset(action)}
      className="flex flex-col gap-4 text-sm"
    >
      <p className="opacity-70">{t.confirmHint}</p>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="border-b border-current/20">
            <tr>
              <th className="py-2 pr-3 font-medium">{c.order}</th>
              <th className="py-2 pr-3 font-medium">{c.product}</th>
              <th className="py-2 pr-3 text-right font-medium">{c.quantity}</th>
              <th className="py-2 pr-3 font-medium">{c.picked}</th>
              <th className="py-2 font-medium">{c.reason}</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr
                key={key(line)}
                className="border-b border-current/10 align-top"
              >
                <td className="py-2 pr-3 whitespace-nowrap">
                  #{line.saleNumber}
                  <span className="block text-xs opacity-70">
                    {line.customer}
                  </span>
                </td>
                <td className="py-2 pr-3">{line.name}</td>
                <td className="py-2 pr-3 text-right whitespace-nowrap">
                  {line.quantityLabel} {line.unit}
                </td>
                <td className="py-2 pr-3">
                  <input
                    {...fields.bind(`picked_${key(line)}`)}
                    inputMode={line.allowsDecimals ? "decimal" : "numeric"}
                    aria-label={`${c.picked} #${line.saleNumber} ${line.name}`}
                    className={`${CONTROL} w-20`}
                  />
                </td>
                <td className="py-2">
                  {short(line) && (
                    <select
                      {...fields.bind(`reason_${key(line)}`)}
                      required
                      aria-label={`${c.reason} #${line.saleNumber} ${line.name}`}
                      className={SELECT}
                    >
                      <option value="">{t.chooseReason}</option>
                      {PICKING_SHORTAGE_REASONS.map((reason) => (
                        <option key={reason} value={reason}>
                          {t.reasons[reason]}
                        </option>
                      ))}
                    </select>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="max-w-sm">
        <Field label={t.preparer}>
          <Input {...fields.bind("preparer")} maxLength={PREPARER_MAX_LENGTH} />
        </Field>
      </div>
      <FormError messages={state.error} />
      <div>
        <SubmitButton pending={pending} pendingLabel={t.working}>
          {t.confirm}
        </SubmitButton>
      </div>
    </form>
  );
}

/** Ubicación de un producto en un depósito, editable en el lugar. */
export function LocationForm({
  productId,
  warehouseId,
  location,
  label,
  t,
}: {
  productId: string;
  warehouseId: string;
  location: string;
  label: string;
  t: Dictionary["stock"];
}) {
  const [state, action, pending] = useActionState<LocationState, FormData>(
    setProductLocation.bind(null, productId, warehouseId),
    {},
  );
  const fields = useFieldValues({ location });
  return (
    <form
      onSubmit={submitWithoutReset(action)}
      className="flex flex-wrap items-center gap-2"
    >
      <input
        {...fields.bind("location")}
        maxLength={LOCATION_MAX_LENGTH}
        placeholder={t.locationPlaceholder}
        aria-label={label}
        className={`${CONTROL} w-28 font-mono uppercase`}
      />
      <button
        type="submit"
        disabled={pending}
        className="text-xs hover:underline disabled:opacity-50"
      >
        {state.savedAt && !state.error ? "✓" : t.saveLocation}
      </button>
      <FormError messages={state.error} />
    </form>
  );
}
