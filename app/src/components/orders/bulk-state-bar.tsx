"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { changeSalesStateBulk } from "@/app/[lang]/admin/orders/actions";
import { FormError, SubmitButton } from "@/components/ui/form";
import { SaleState } from "@/generated/prisma/enums";
import { interpolate } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/es";
import {
  STATE_COMMENT_MAX_LENGTH,
  type BulkStateChangeState,
} from "@/lib/sale-state-form";

// Las casillas de cada pedido están en la tabla (Server Component) y se
// asocian a este form con el atributo `form`.
export const BULK_FORM_ID = "bulk-states";

const CONTROL = "rounded border border-current/20 bg-transparent px-3 py-2";

function boxes(group?: string): HTMLInputElement[] {
  const selector = `input[type=checkbox][form=${BULK_FORM_ID}][name=sale]${
    group ? `[data-group="${group}"]` : ""
  }`;
  return [...document.querySelectorAll<HTMLInputElement>(selector)];
}

/** Barra de cambio de estado masivo, con el resultado de cada pedido. */
export function BulkStateBar({
  warehouses,
  t,
  states,
}: {
  warehouses: { id: string; name: string }[];
  t: Dictionary["adminOrders"]["bulk"];
  states: Dictionary["orders"]["states"];
}) {
  const [state, action, pending] = useActionState<
    BulkStateChangeState,
    FormData
  >(changeSalesStateBulk, {});
  const [count, setCount] = useState(0);

  // Cuenta las casillas marcadas (están fuera de este componente).
  useEffect(() => {
    const update = () => setCount(boxes().filter((box) => box.checked).length);
    document.addEventListener("change", update);
    update();
    return () => document.removeEventListener("change", update);
  }, []);

  // Después de aplicar, se desmarcan: la tabla ya muestra los estados nuevos.
  useEffect(() => {
    if (!state.savedAt) return;
    for (const box of boxes()) box.checked = false;
    for (const box of document.querySelectorAll<HTMLInputElement>(
      "input[data-select-group]",
    )) {
      box.checked = false;
    }
    document.dispatchEvent(new Event("change"));
  }, [state.savedAt]);

  const failed = state.results?.filter((result) => result.error) ?? [];

  return (
    <form
      id={BULK_FORM_ID}
      action={action}
      className="mt-4 flex flex-col gap-3 rounded border border-current/20 p-4 text-sm print:hidden"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-medium">{t.title}</h2>
        <span className="opacity-70">
          {count > 0 ? interpolate(t.selected, { count }) : t.none}
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1">
          <span className="font-medium">{t.target}</span>
          <select name="to" required defaultValue="" className={CONTROL}>
            <option value="" disabled>
              {t.choose}
            </option>
            {Object.values(SaleState).map((value) => (
              <option key={value} value={value}>
                {states[value]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-medium">{t.warehouse}</span>
          <select
            name="warehouse"
            defaultValue={warehouses.length === 1 ? warehouses[0].id : ""}
            className={CONTROL}
          >
            <option value="">—</option>
            {warehouses.map((warehouse) => (
              <option key={warehouse.id} value={warehouse.id}>
                {warehouse.name}
              </option>
            ))}
          </select>
          <span className="text-xs opacity-60">{t.warehouseHint}</span>
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-medium">{t.comment}</span>
          <input
            name="comment"
            maxLength={STATE_COMMENT_MAX_LENGTH}
            className={CONTROL}
          />
        </label>
      </div>

      <FormError messages={state.error} />
      {state.results && (
        <div role="status">
          <p className="font-medium">
            {interpolate(t.done, {
              ok: state.results.length - failed.length,
              total: state.results.length,
            })}
          </p>
          {failed.length > 0 && (
            <ul className="mt-1 text-red-600">
              {failed.map((result) => (
                <li key={result.number}>
                  <Link
                    href={`/admin/orders/${result.number}`}
                    className="hover:underline"
                  >
                    {interpolate(t.failed, {
                      number: result.number,
                      error: result.error ?? "",
                    })}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div>
        <SubmitButton pending={pending} pendingLabel={t.saving}>
          {t.submit}
        </SubmitButton>
      </div>
    </form>
  );
}

/** Casilla de un pedido, asociada a la barra masiva. */
export function SelectOrder({
  id,
  state,
  number,
  group,
  label,
}: {
  id: string;
  state: SaleState;
  number: number;
  /** Para "elegir todos" de una zona. */
  group?: string;
  label: string;
}) {
  return (
    <input
      type="checkbox"
      name="sale"
      value={`${id}:${state}`}
      form={BULK_FORM_ID}
      data-group={group}
      aria-label={interpolate(label, { number })}
      className="print:hidden"
    />
  );
}

/** "Elegir todos" de un grupo (una zona) o de la página. */
export function SelectGroup({
  group,
  label,
}: {
  group?: string;
  label: string;
}) {
  return (
    <input
      type="checkbox"
      aria-label={label}
      title={label}
      data-select-group
      className="print:hidden"
      onChange={(event) => {
        for (const box of boxes(group)) box.checked = event.target.checked;
        // Avisa a la barra para que recuente.
        document.dispatchEvent(new Event("change"));
      }}
    />
  );
}
