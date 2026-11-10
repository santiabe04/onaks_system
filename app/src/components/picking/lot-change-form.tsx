"use client";

import { useActionState } from "react";
import { FormError, SubmitButton } from "@/components/ui/form";
import type { Dictionary } from "@/i18n/dictionaries/es";
import {
  changePickingLot,
  type PickingActionState,
} from "@/app/[lang]/admin/picking/actions";

type LotOption = { id: string; label: string };

const CONTROL = "rounded border border-current/20 bg-transparent px-2 py-1";

/** Moves a quantity from one lot to another in an order on an open list. */
export function LotChangeForm({
  listId,
  saleId,
  productId,
  assigned,
  available,
  t,
}: {
  listId: string;
  saleId: string;
  productId: string;
  /** The lots the order's goods come from today. */
  assigned: LotOption[];
  /** The lots with stock of the product in the warehouse. */
  available: LotOption[];
  t: Dictionary["picking"];
}) {
  const [state, action, pending] = useActionState<PickingActionState, FormData>(
    changePickingLot.bind(null, listId),
    {},
  );
  return (
    <details className="mt-1 text-xs">
      <summary className="cursor-pointer underline">{t.changeLot}</summary>
      <form action={action} className="mt-2 flex flex-col gap-2">
        <input type="hidden" name="saleId" value={saleId} />
        <input type="hidden" name="productId" value={productId} />
        <p className="opacity-70">{t.changeLotHint}</p>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1">
            {t.fromLot}
            <select name="fromLotId" className={CONTROL} defaultValue="">
              <option value="" disabled />
              {assigned.map((lot) => (
                <option key={lot.id} value={lot.id}>
                  {lot.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            {t.toLot}
            <select name="toLotId" className={CONTROL} defaultValue="">
              <option value="" disabled />
              {available.map((lot) => (
                <option key={lot.id} value={lot.id}>
                  {lot.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            {t.lotQuantity}
            <input
              name="quantity"
              inputMode="decimal"
              required
              className={`${CONTROL} w-20`}
            />
          </label>
          <SubmitButton pending={pending} pendingLabel={t.changing}>
            {t.changeLot}
          </SubmitButton>
        </div>
        <FormError messages={state.error} />
      </form>
    </details>
  );
}
