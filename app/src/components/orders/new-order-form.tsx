"use client";

import { useActionState, useState } from "react";
import {
  createOrderForCustomer,
  type NewOrderState,
} from "@/app/[lang]/admin/orders/new/actions";
import { Field, FormError, SubmitButton } from "@/components/ui/form";
import { submitWithoutReset } from "@/components/ui/use-field-values";
import { interpolate, type Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/es";
import { formatters } from "@/i18n/format";
import { searchKey, searchProducts } from "@/lib/admin-order";
import { cartTotals, lineTotals, parseCartQuantity } from "@/lib/cart";
import { NOTES_MAX_LENGTH } from "@/lib/checkout";

const CONTROL = "rounded border border-current/20 bg-transparent px-3 py-2";

export type OrderCustomer = {
  id: string;
  name: string;
  cuit: string;
  addresses: { id: string; name: string; detail: string }[];
};

export type OrderProduct = {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
  unit: string;
  allowsDecimals: boolean;
  /** Decimales como string: precio neto, alícuota y peso unitario. */
  price: string;
  rate: string;
  weight: string;
};

/** Armar un pedido para un cliente: cliente, dirección, productos y comentario. */
export function NewOrderForm({
  customers,
  products,
  initialCustomerId,
  locale,
  t,
}: {
  customers: OrderCustomer[];
  products: OrderProduct[];
  initialCustomerId: string;
  locale: Locale;
  t: Dictionary["adminOrderNew"];
}) {
  const [state, action, pending] = useActionState<NewOrderState, FormData>(
    createOrderForCustomer,
    {},
  );
  const format = formatters(locale);
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerId, setCustomerId] = useState(initialCustomerId);
  const [addressId, setAddressId] = useState(() => {
    const initial = customers.find((row) => row.id === initialCustomerId);
    return initial?.addresses.length === 1 ? initial.addresses[0].id : "";
  });
  const [productQuery, setProductQuery] = useState("");
  const [lines, setLines] = useState<{ productId: string; quantity: string }[]>(
    [],
  );
  const [notes, setNotes] = useState("");

  const customer = customers.find((row) => row.id === customerId);
  const customerOptions = customerQuery.trim()
    ? customers.filter(
        (row) =>
          row.id === customerId ||
          searchKey(`${row.name} ${row.cuit}`).includes(
            searchKey(customerQuery),
          ),
      )
    : customers;
  const chooseCustomer = (id: string) => {
    setCustomerId(id);
    const chosen = customers.find((row) => row.id === id);
    setAddressId(chosen?.addresses.length === 1 ? chosen.addresses[0].id : "");
  };

  const found = searchProducts(products, productQuery);
  const product = (id: string) => products.find((row) => row.id === id)!;
  const add = (id: string) => {
    if (lines.some((line) => line.productId === id)) return;
    setLines([...lines, { productId: id, quantity: "1" }]);
    setProductQuery("");
  };
  const setQuantity = (id: string, quantity: string) =>
    setLines(
      lines.map((line) =>
        line.productId === id ? { ...line, quantity } : line,
      ),
    );

  // Totales en vivo con la misma cuenta que el server (líneas válidas).
  const valid = lines
    .map((line) => {
      const row = product(line.productId);
      const quantity = parseCartQuantity(line.quantity, row.allowsDecimals);
      return quantity
        ? { price: row.price, rate: row.rate, quantity, weight: row.weight }
        : null;
    })
    .filter((line) => line !== null);
  const totals = cartTotals(valid);
  const c = t.columns;

  return (
    <form
      onSubmit={submitWithoutReset(action)}
      className="flex flex-col gap-6 text-sm"
    >
      <section className="flex flex-col gap-3">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t.customerSearch}>
            <input
              value={customerQuery}
              onChange={(event) => setCustomerQuery(event.target.value)}
              className={CONTROL}
            />
          </Field>
          <Field label={t.customer}>
            <select
              name="customerId"
              value={customerId}
              onChange={(event) => chooseCustomer(event.target.value)}
              required
              className={CONTROL}
            >
              <option value="">
                {customerOptions.length === 0
                  ? t.noCustomers
                  : t.chooseCustomer}
              </option>
              {customerOptions.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name} · {row.cuit}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {customer && (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 font-medium">{t.address}</legend>
            {customer.addresses.length === 0 ? (
              <p className="text-red-600">{t.noAddresses}</p>
            ) : (
              customer.addresses.map((address) => (
                <label
                  key={address.id}
                  className="flex items-start gap-2 rounded border border-current/20 p-3"
                >
                  <input
                    type="radio"
                    name="addressId"
                    value={address.id}
                    checked={addressId === address.id}
                    onChange={() => setAddressId(address.id)}
                    className="mt-1"
                  />
                  <span>
                    <span className="font-medium">{address.name}</span>
                    <span className="block text-xs opacity-70">
                      {address.detail}
                    </span>
                  </span>
                </label>
              ))
            )}
          </fieldset>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">{t.products}</h2>
        <Field label={t.productSearch}>
          <input
            value={productQuery}
            onChange={(event) => setProductQuery(event.target.value)}
            className={CONTROL}
          />
        </Field>
        {productQuery.trim() &&
          (found.length === 0 ? (
            <p className="opacity-70">{t.noResults}</p>
          ) : (
            <ul className="divide-y divide-current/10 rounded border border-current/20">
              {found.map((row) => {
                const inOrder = lines.some((line) => line.productId === row.id);
                return (
                  <li
                    key={row.id}
                    className="flex items-center justify-between gap-3 p-2"
                  >
                    <span>
                      {row.name}
                      <span className="block font-mono text-xs opacity-70">
                        {row.sku} ·{" "}
                        {format.money(
                          lineTotals({ ...row, quantity: "1" }).total,
                        )}{" "}
                        / {row.unit}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => add(row.id)}
                      disabled={inOrder}
                      className="rounded border border-current/20 px-3 py-1 disabled:opacity-50"
                    >
                      {inOrder ? t.inOrder : t.add}
                    </button>
                  </li>
                );
              })}
            </ul>
          ))}

        {lines.length === 0 ? (
          <p className="opacity-70">{t.empty}</p>
        ) : (
          <div className="overflow-x-auto print:overflow-visible">
            <table className="w-full text-left">
              <thead className="border-b border-current/20">
                <tr>
                  <th className="py-2 pr-3 font-medium">{c.product}</th>
                  <th className="py-2 pr-3 text-right font-medium">
                    {c.unitPrice}
                  </th>
                  <th className="py-2 pr-3 font-medium">{c.quantity}</th>
                  <th className="py-2 pr-3 text-right font-medium">
                    {c.lineTotal}
                  </th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => {
                  const row = product(line.productId);
                  const quantity = parseCartQuantity(
                    line.quantity,
                    row.allowsDecimals,
                  );
                  return (
                    <tr
                      key={line.productId}
                      className="border-b border-current/10"
                    >
                      <td className="py-2 pr-3">
                        {row.name}
                        <span className="block font-mono text-xs opacity-70">
                          {row.sku}
                        </span>
                      </td>
                      <td className="py-2 pr-3 text-right whitespace-nowrap">
                        {format.money(
                          lineTotals({ ...row, quantity: "1" }).total,
                        )}
                      </td>
                      <td className="py-2 pr-3">
                        <span className="flex items-center gap-1">
                          <input
                            name={`qty_${row.id}`}
                            value={line.quantity}
                            onChange={(event) =>
                              setQuantity(row.id, event.target.value)
                            }
                            inputMode={
                              row.allowsDecimals ? "decimal" : "numeric"
                            }
                            aria-label={`${c.quantity} ${row.name}`}
                            className={`${CONTROL} w-24 ${quantity ? "" : "border-red-600"}`}
                          />
                          <span className="text-xs opacity-70">{row.unit}</span>
                        </span>
                      </td>
                      <td className="py-2 pr-3 text-right whitespace-nowrap">
                        {quantity
                          ? format.money(lineTotals({ ...row, quantity }).total)
                          : "—"}
                      </td>
                      <td className="py-2 text-right">
                        <button
                          type="button"
                          onClick={() =>
                            setLines(
                              lines.filter(
                                (other) => other.productId !== row.id,
                              ),
                            )
                          }
                          className="text-red-600 hover:underline"
                        >
                          {t.remove}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <dl className="ml-auto flex w-full max-w-xs flex-col gap-1">
          <div className="flex justify-between">
            <dt className="opacity-70">{t.net}</dt>
            <dd>{format.money(totals.net)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="opacity-70">{t.tax}</dt>
            <dd>{format.money(totals.tax)}</dd>
          </div>
          <div className="flex justify-between border-t border-current/20 pt-1 text-base font-semibold">
            <dt>{t.total}</dt>
            <dd>{format.money(totals.total)}</dd>
          </div>
          <p className="text-xs opacity-70">
            {interpolate(t.weight, { weight: format.number(totals.weight) })}
          </p>
        </dl>
      </section>

      <Field label={t.notesOptional}>
        <textarea
          name="notes"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          maxLength={NOTES_MAX_LENGTH}
          rows={2}
          placeholder={t.notesPlaceholder}
          className={CONTROL}
        />
      </Field>

      <p className="text-xs opacity-70">{t.pricesHint}</p>
      <FormError messages={state.error} />
      <div>
        <SubmitButton pending={pending} pendingLabel={t.confirming}>
          {t.confirm}
        </SubmitButton>
      </div>
    </form>
  );
}
