"use client";

import { useActionState, useState } from "react";
import { FormError, SubmitButton } from "@/components/ui/form";
import type { SaleState } from "@/generated/prisma/enums";
import { interpolate } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/es";
import { STATE_COMMENT_MAX_LENGTH } from "@/lib/sale-state-form";
import type { StateChangeFormState } from "@/lib/sale-state-form";
import { changeSaleState } from "../actions";

export type TargetOption = {
  state: SaleState;
  back: boolean;
  effect: "deduct" | "return" | null;
};

const CONTROL = "rounded border border-current/20 bg-transparent px-3 py-2";

export function StateChangeForm({
  saleId,
  current,
  targets,
  items,
  warehouses,
  t,
  states,
}: {
  saleId: string;
  current: SaleState;
  targets: TargetOption[];
  items: { productId: string; name: string; quantity: string }[];
  warehouses: { id: string; name: string }[];
  t: Dictionary["adminOrders"]["stateChange"];
  states: Dictionary["orders"]["states"];
}) {
  const [state, action, pending] = useActionState<
    StateChangeFormState,
    FormData
  >(changeSaleState.bind(null, saleId), {});
  // Solo para mostrar los depósitos y avisos del destino elegido.
  const [to, setTo] = useState<SaleState | "">("");
  const target = targets.find((option) => option.state === to);

  if (targets.length === 0) {
    return <p className="text-sm opacity-70">{t.final}</p>;
  }

  return (
    // key: después de guardar, el form vuelve a empezar con el estado nuevo.
    <form
      key={`${current}-${state.savedAt ?? 0}`}
      action={action}
      className="flex flex-col gap-4 text-sm"
    >
      <input type="hidden" name="from" value={current} />

      <label className="flex flex-col gap-1">
        <span className="font-medium">{t.target}</span>
        <select
          name="to"
          required
          defaultValue=""
          onChange={(event) => setTo(event.target.value as SaleState)}
          className={CONTROL}
        >
          <option value="" disabled>
            {t.choose}
          </option>
          {targets.map((option) => (
            <option key={option.state} value={option.state}>
              {option.back
                ? interpolate(t.back, { state: states[option.state] })
                : states[option.state]}
            </option>
          ))}
        </select>
      </label>

      {target?.effect === "return" && (
        <p className="opacity-70">{t.returnHint}</p>
      )}
      {target?.state === "CANCELED" && (
        <p className="opacity-70">{t.cancelHint}</p>
      )}

      {target?.effect === "deduct" && (
        <div className="flex flex-col gap-3 rounded border border-current/20 p-3">
          <p className="opacity-70">{t.deductHint}</p>
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
          </label>
          {warehouses.length > 1 && (
            <details>
              <summary className="cursor-pointer font-medium">
                {t.itemWarehouses}
              </summary>
              <div className="mt-2 flex flex-col gap-2">
                {items.map((item) => (
                  <label
                    key={item.productId}
                    className="flex flex-wrap items-center justify-between gap-2"
                  >
                    <span>
                      {item.name}{" "}
                      <span className="opacity-70">({item.quantity})</span>
                    </span>
                    <select
                      name={`warehouse_${item.productId}`}
                      defaultValue=""
                      className={CONTROL}
                    >
                      <option value="">{t.sameAsOrder}</option>
                      {warehouses.map((warehouse) => (
                        <option key={warehouse.id} value={warehouse.id}>
                          {warehouse.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            </details>
          )}
        </div>
      )}

      <label className="flex flex-col gap-1">
        <span className="font-medium">{t.comment}</span>
        <input
          name="comment"
          maxLength={STATE_COMMENT_MAX_LENGTH}
          placeholder={t.commentPlaceholder}
          className={CONTROL}
        />
      </label>

      <FormError messages={state.error} />
      {state.savedAt && !state.error && (
        <p role="status" className="text-green-700 dark:text-green-400">
          ✓ {t.saved}
        </p>
      )}

      <div>
        <SubmitButton pending={pending} pendingLabel={t.saving}>
          {t.submit}
        </SubmitButton>
      </div>
    </form>
  );
}
