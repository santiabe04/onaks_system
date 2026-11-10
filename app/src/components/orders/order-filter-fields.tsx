import type { ComponentProps, ReactNode } from "react";
import {
  PaymentMethod,
  SalePaymentState,
  SaleState,
} from "@/generated/prisma/enums";
import type { Dictionary } from "@/i18n/dictionaries/es";
import type { OrderFilterOptions } from "@/lib/order-filter-options";
import type { ZoneFilters } from "@/lib/order-filters";

// Server Component: the order filter fields shared by the list and the
// by-zone view. Each screen provides the <form> (GET) and the button.

const CONTROL = "rounded border border-current/20 bg-transparent px-3 py-2";

export function OrderFilterFields({
  filters,
  options,
  t,
  children,
}: {
  filters: ZoneFilters;
  options: OrderFilterOptions;
  t: Dictionary;
  /** Fields specific to the screen (number, dates), at the start of the grid. */
  children?: ReactNode;
}) {
  const l = t.adminOrdersList;
  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {children}
        <Select
          label={l.customer}
          name="customer"
          value={filters.customer}
          all={l.all}
          options={options.customers.map((c) => ({
            value: c.id,
            label: c.tradeName,
          }))}
        />
        <Select
          label={l.city}
          name="city"
          value={filters.city ? String(filters.city) : undefined}
          all={l.all}
          options={options.cities.map((c) => ({
            value: String(c.id),
            label: c.name,
          }))}
        />
        <Select
          label={l.product}
          name="product"
          value={filters.product}
          all={l.all}
          options={options.products.map((p) => ({
            value: p.id,
            label: `${p.name} (${p.sku})`,
          }))}
        />
        <Select
          label={l.paymentMethod}
          name="paymentMethod"
          value={filters.paymentMethod}
          all={l.all}
          options={Object.values(PaymentMethod).map((method) => ({
            value: method,
            label: t.orders.paymentMethods[method],
          }))}
        />
      </div>

      <Checkboxes
        legend={l.states}
        name="state"
        checked={filters.states}
        options={Object.values(SaleState).map((state) => ({
          value: state,
          label: t.orders.states[state],
        }))}
      />
      <Checkboxes
        legend={l.paymentStates}
        name="paymentState"
        checked={filters.paymentStates}
        options={Object.values(SalePaymentState).map((state) => ({
          value: state,
          label: t.orders.paymentStates[state],
        }))}
      />
    </>
  );
}

/** One more field in the grid (number, dates…), with the same style. */
export function FilterInput({
  label,
  ...props
}: { label: string } & ComponentProps<"input">) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-medium">{label}</span>
      <input {...props} className={CONTROL} />
    </label>
  );
}

function Select({
  label,
  name,
  value,
  all,
  options,
}: {
  label: string;
  name: string;
  value?: string;
  all: string;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-medium">{label}</span>
      <select name={name} defaultValue={value ?? ""} className={CONTROL}>
        <option value="">{all}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Several values at once; none checked = all. */
function Checkboxes({
  legend,
  name,
  checked,
  options,
}: {
  legend: string;
  name: string;
  checked: string[];
  options: { value: string; label: string }[];
}) {
  return (
    <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <legend className="mb-1 w-full font-medium">{legend}</legend>
      {options.map((option) => (
        <label key={option.value} className="flex items-center gap-1.5">
          <input
            type="checkbox"
            name={name}
            value={option.value}
            defaultChecked={checked.includes(option.value)}
          />
          {option.label}
        </label>
      ))}
    </fieldset>
  );
}
