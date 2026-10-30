"use client";

import { useActionState, useState } from "react";
import { Field, FormError, SubmitButton } from "@/components/ui/form";
import {
  submitWithoutReset,
  useFieldValues,
} from "@/components/ui/use-field-values";
import { interpolate, type Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/es";
import { formatters } from "@/i18n/format";
import { searchProducts } from "@/lib/admin-order";
import { listPrice } from "@/lib/customer-price";
import { parseDecimalInput, PRICE_LIMITS } from "@/lib/decimal-input";
import type { FixedPricesState } from "./actions";

const CONTROL = "rounded border border-current/20 bg-transparent px-3 py-2";

type Product = {
  id: string;
  name: string;
  sku: string;
  /** Precio neto base. */
  price: string;
  /** Precio fijo en la lista, como para el input ("" si no tiene). */
  fixed: string;
};

/**
 * Precios fijos de una lista: un input por producto (vacío = base con el
 * ajuste). El buscador solo oculta filas: se guardan todas juntas.
 */
export function FixedPricesForm({
  action,
  adjustment,
  products,
  locale,
  t,
}: {
  action: (
    state: FixedPricesState,
    formData: FormData,
  ) => Promise<FixedPricesState>;
  adjustment: string;
  products: Product[];
  locale: Locale;
  t: Dictionary["priceLists"];
}) {
  const [state, dispatch, pending] = useActionState(action, {});
  const fields = useFieldValues(
    Object.fromEntries(products.map((row) => [`price_${row.id}`, row.fixed])),
  );
  const [query, setQuery] = useState("");
  const format = formatters(locale);
  const shown = new Set(
    (query.trim()
      ? searchProducts(
          products.map((row) => ({ ...row, barcode: null })),
          query,
          products.length,
        )
      : products
    ).map((row) => row.id),
  );
  const pricing = { adjustment, discount: "0", overrides: {} };

  return (
    <form
      onSubmit={submitWithoutReset(dispatch)}
      className="mt-4 flex flex-col gap-4 text-sm"
    >
      <Field label={t.productSearch}>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className={`${CONTROL} max-w-sm`}
        />
      </Field>
      {shown.size === 0 && <p className="opacity-70">{t.noProducts}</p>}
      <div className="overflow-x-auto print:overflow-visible">
        <table className="w-full text-left">
          <thead className="border-b border-current/20">
            <tr>
              <th className="py-2 pr-3 font-medium">{t.product}</th>
              <th className="py-2 pr-3 text-right font-medium">
                {t.basePrice}
              </th>
              <th className="py-2 pr-3 text-right font-medium">
                {t.listPrice}
              </th>
              <th className="py-2 font-medium">{t.fixedPrice}</th>
            </tr>
          </thead>
          <tbody>
            {products.map((row) => {
              const name = `price_${row.id}`;
              const raw = fields.value(name);
              const fixed = raw.trim()
                ? parseDecimalInput(raw, PRICE_LIMITS)
                : null;
              const invalid =
                raw.trim() !== "" && (!fixed || Number(fixed) <= 0);
              return (
                <tr
                  key={row.id}
                  className={`border-b border-current/10 ${shown.has(row.id) ? "" : "hidden"}`}
                >
                  <td className="py-2 pr-3">
                    {row.name}
                    <span className="block font-mono text-xs opacity-70">
                      {row.sku}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-right whitespace-nowrap">
                    {format.money(row.price)}
                  </td>
                  <td className="py-2 pr-3 text-right whitespace-nowrap">
                    {invalid
                      ? "—"
                      : format.money(
                          fixed ?? listPrice(row.id, row.price, pricing),
                        )}
                  </td>
                  <td className="py-2">
                    <input
                      {...fields.bind(name)}
                      inputMode="decimal"
                      aria-label={interpolate(t.fixedPriceFor, {
                        name: row.name,
                      })}
                      className={`${CONTROL} w-32 ${invalid ? "border-red-600" : ""}`}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <FormError messages={state.error} />
      {state.saved && !pending && (
        <p role="status" className="text-green-700 dark:text-green-400">
          {t.saved}
        </p>
      )}
      <div>
        <SubmitButton pending={pending} pendingLabel={t.savePrices}>
          {t.savePrices}
        </SubmitButton>
      </div>
    </form>
  );
}
