"use client";

import { useActionState } from "react";
import { FormError, SubmitButton } from "@/components/ui/form";
import {
  submitWithoutReset,
  useFieldValues,
} from "@/components/ui/use-field-values";
import { ReturnDestination } from "@/generated/prisma/enums";
import { interpolate, type Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/es";
import { formatters } from "@/i18n/format";
import { parseCartQuantity } from "@/lib/cart";
import {
  CREDIT_NOTE_REASON_MAX_LENGTH,
  returnAmount,
} from "@/lib/customer-credit";
import { registerReturn, type ReturnFormState } from "./actions";

const CONTROL = "rounded border border-current/20 bg-transparent px-3 py-2";

type Line = {
  productId: string;
  name: string;
  sku: string;
  unit: string;
  allowsDecimals: boolean;
  delivered: string;
  returned: string;
  /** What can still be returned. */
  left: string;
  unitPrice: string;
  unitTaxRate: string;
};

/**
 * Return of a delivered order: warehouse, reason and, per product, how much
 * comes back and what is done with it. The total is calculated live with the same
 * calculation as the server (order price and tax rate).
 */
export function ReturnForm({
  saleId,
  warehouses,
  lines,
  locale,
  t,
}: {
  saleId: string;
  warehouses: { id: string; name: string }[];
  lines: Line[];
  locale: Locale;
  t: Dictionary["customerCreditNotes"];
}) {
  const [state, dispatch, pending] = useActionState<ReturnFormState, FormData>(
    registerReturn.bind(null, saleId),
    {},
  );
  const format = formatters(locale);
  const fields = useFieldValues({
    warehouse: warehouses.length === 1 ? warehouses[0].id : "",
    reason: "",
    ...Object.fromEntries(
      lines.map((line) => [`dest_${line.productId}`, "RESTOCK"]),
    ),
  });

  // Valid quantities (up to what is left) for the live total.
  const chosen = lines
    .map((line) => {
      const quantity = parseCartQuantity(
        fields.value(`qty_${line.productId}`),
        line.allowsDecimals,
      );
      return quantity && Number(quantity) <= Number(line.left)
        ? { line, quantity }
        : null;
    })
    .filter((row) => row !== null);
  const total = returnAmount(
    chosen.map(({ line, quantity }) => ({
      quantity,
      unitPrice: line.unitPrice,
      unitTaxRate: line.unitTaxRate,
    })),
  );

  return (
    <form
      onSubmit={submitWithoutReset(dispatch)}
      className="flex flex-col gap-6 text-sm"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="font-medium">{t.warehouse}</span>
          <select {...fields.bind("warehouse")} required className={CONTROL}>
            <option value="">{t.chooseWarehouse}</option>
            {warehouses.map((warehouse) => (
              <option key={warehouse.id} value={warehouse.id}>
                {warehouse.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-medium">{t.reason}</span>
          <input
            {...fields.bind("reason")}
            required
            maxLength={CREDIT_NOTE_REASON_MAX_LENGTH}
            placeholder={t.reasonPlaceholder}
            className={CONTROL}
          />
        </label>
      </div>

      <div className="overflow-x-auto print:overflow-visible">
        <table className="w-full text-left">
          <thead className="border-b border-current/20">
            <tr>
              <th className="py-2 pr-3 font-medium">{t.product}</th>
              <th className="py-2 pr-3 text-right font-medium">
                {t.delivered}
              </th>
              <th className="py-2 pr-3 text-right font-medium">
                {t.alreadyReturned}
              </th>
              <th className="py-2 pr-3 font-medium">{t.returns}</th>
              <th className="py-2 pr-3 font-medium">{t.destination}</th>
              <th className="py-2 text-right font-medium">{t.lineAmount}</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => {
              const done = Number(line.left) === 0;
              const row = chosen.find(
                (item) => item.line.productId === line.productId,
              );
              return (
                <tr
                  key={line.productId}
                  className={`border-b border-current/10 align-top ${done ? "opacity-50" : ""}`}
                >
                  <td className="py-2 pr-3">
                    {line.name}
                    <span className="block font-mono text-xs opacity-70">
                      {line.sku}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-right whitespace-nowrap">
                    {format.number(line.delivered)} {line.unit}
                  </td>
                  <td className="py-2 pr-3 text-right whitespace-nowrap">
                    {format.number(line.returned)}
                  </td>
                  <td className="py-2 pr-3">
                    <input
                      {...fields.bind(`qty_${line.productId}`)}
                      disabled={done}
                      inputMode={line.allowsDecimals ? "decimal" : "numeric"}
                      aria-label={`${t.returns} ${line.name}`}
                      placeholder={`0 / ${format.number(line.left)}`}
                      className={`${CONTROL} w-28`}
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <select
                      {...fields.bind(`dest_${line.productId}`)}
                      disabled={done}
                      aria-label={`${t.destination} ${line.name}`}
                      className={CONTROL}
                    >
                      {Object.values(ReturnDestination).map((destination) => (
                        <option key={destination} value={destination}>
                          {t.destinations[destination]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 text-right whitespace-nowrap">
                    {row
                      ? format.money(
                          returnAmount([
                            {
                              quantity: row.quantity,
                              unitPrice: line.unitPrice,
                              unitTaxRate: line.unitTaxRate,
                            },
                          ]),
                        )
                      : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-base font-semibold">
        {interpolate(t.total, { amount: format.money(total) })}
      </p>
      <FormError messages={state.error} />
      <div>
        <SubmitButton pending={pending} pendingLabel={t.submitting}>
          {t.submit}
        </SubmitButton>
      </div>
    </form>
  );
}
