import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { buttonClass } from "@/components/ui/button";
import {
  PaymentMethod,
  SalePaymentState,
  SaleState,
} from "@/generated/prisma/enums";
import { interpolate } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionary";
import { formatters } from "@/i18n/format";
import { getLocale, getT } from "@/i18n/server";
import { getUserWithPermission } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  hasOrderFilters,
  ORDERS_PAGE_SIZE,
  orderQuery,
  orderWhere,
  parseOrderFilters,
  type OrderFilters,
} from "@/lib/order-filters";

const PATH = "/admin/orders/list";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.adminOrdersList.title };
}

export default async function OrdersListPage({
  searchParams,
}: PageProps<"/[lang]/admin/orders/list">) {
  const t = await getT();

  return (
    <main className="mx-auto w-full max-w-6xl p-8">
      <h1 className="text-2xl font-semibold">{t.adminOrdersList.title}</h1>
      {/* Los filtros vienen de la URL y los pedidos de la DB: van en Suspense. */}
      <Suspense
        fallback={<p className="mt-6 text-sm opacity-70">{t.common.loading}</p>}
      >
        <OrdersList searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function OrdersList({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await getUserWithPermission("sales:read-all");
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const format = formatters(locale);
  const filters = parseOrderFilters(await searchParams);
  const where = orderWhere(filters);

  const [customers, cities, products, summary, sales] = await Promise.all([
    db.customer.findMany({
      orderBy: { tradeName: "asc" },
      select: { id: true, tradeName: true },
    }),
    db.city.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    // También los pausados y borrados: pueden estar en pedidos viejos.
    db.product.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        sku: true,
        measurementUnit: { select: { name: true } },
      },
    }),
    db.sale.aggregate({ where, _count: true, _sum: { total: true } }),
    db.sale.findMany({
      where,
      orderBy: { number: "desc" },
      skip: (filters.page - 1) * ORDERS_PAGE_SIZE,
      take: ORDERS_PAGE_SIZE,
      select: {
        number: true,
        createdAt: true,
        state: true,
        paymentMethod: true,
        paymentState: true,
        total: true,
        address: {
          select: {
            customer: { select: { tradeName: true } },
            city: { select: { name: true } },
          },
        },
        // Con un producto elegido: cuánto se pidió de ese producto.
        items: filters.product
          ? {
              where: { productId: filters.product },
              select: { quantity: true },
            }
          : false,
      },
    }),
  ]);
  const product = products.find((p) => p.id === filters.product);
  const productTotal = product
    ? await db.saleItem.aggregate({
        where: { productId: product.id, sale: where },
        _sum: { quantity: true },
      })
    : null;
  const total = summary._count;
  const pages = Math.max(1, Math.ceil(total / ORDERS_PAGE_SIZE));

  return (
    <>
      <FiltersForm
        filters={filters}
        t={t}
        customers={customers}
        cities={cities}
        products={products}
      />

      {total === 0 ? (
        <p className="mt-6 text-sm opacity-70">{t.adminOrdersList.empty}</p>
      ) : (
        <>
          <p className="mt-6 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <span>
              {interpolate(t.adminOrdersList.count, {
                count: format.number(total),
              })}
            </span>
            <span className="font-semibold">
              {interpolate(t.adminOrdersList.amount, {
                amount: format.money(summary._sum.total ?? 0),
              })}
            </span>
            {product && productTotal && (
              <span className="font-semibold">
                {interpolate(t.adminOrdersList.productTotal, {
                  product: product.name,
                  quantity: format.number(productTotal._sum.quantity ?? 0),
                  unit: product.measurementUnit.name,
                })}
              </span>
            )}
          </p>

          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-current/20">
                <tr>
                  <th className="py-2 pr-3 font-medium">
                    {t.adminOrdersList.columns.number}
                  </th>
                  <th className="py-2 pr-3 font-medium">
                    {t.adminOrdersList.columns.date}
                  </th>
                  <th className="py-2 pr-3 font-medium">
                    {t.adminOrdersList.columns.customer}
                  </th>
                  <th className="py-2 pr-3 font-medium">
                    {t.adminOrdersList.columns.zone}
                  </th>
                  <th className="py-2 pr-3 font-medium">
                    {t.adminOrdersList.columns.state}
                  </th>
                  <th className="py-2 pr-3 font-medium">
                    {t.adminOrdersList.columns.payment}
                  </th>
                  {product && (
                    <th className="py-2 pr-3 text-right font-medium">
                      {t.adminOrdersList.columns.productQuantity}
                    </th>
                  )}
                  <th className="py-2 text-right font-medium">
                    {t.adminOrdersList.columns.total}
                  </th>
                </tr>
              </thead>
              <tbody>
                {sales.map((sale) => (
                  <tr
                    key={sale.number}
                    className="border-b border-current/10 align-top"
                  >
                    <td className="py-2 pr-3">
                      <Link
                        href={`/admin/orders/${sale.number}`}
                        className="font-medium hover:underline"
                      >
                        #{sale.number}
                      </Link>
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {format.dateTime(sale.createdAt)}
                    </td>
                    <td className="py-2 pr-3">
                      {sale.address.customer.tradeName}
                    </td>
                    <td className="py-2 pr-3">{sale.address.city.name}</td>
                    <td className="py-2 pr-3">{t.orders.states[sale.state]}</td>
                    <td className="py-2 pr-3">
                      {t.orders.paymentMethods[sale.paymentMethod]}
                      <span className="block text-xs opacity-70">
                        {t.orders.paymentStates[sale.paymentState]}
                      </span>
                    </td>
                    {product && (
                      <td className="py-2 pr-3 text-right whitespace-nowrap">
                        {format.number(sale.items[0]?.quantity ?? 0)}{" "}
                        {product.measurementUnit.name}
                      </td>
                    )}
                    <td className="py-2 text-right whitespace-nowrap">
                      {format.money(sale.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <nav className="mt-6 flex items-center justify-between gap-4 text-sm">
        <span className="opacity-70">
          {interpolate(t.adminOrdersList.page, { page: filters.page, pages })}
        </span>
        <div className="flex gap-3">
          {filters.page > 1 && (
            <Link
              href={`${PATH}${orderQuery(filters, filters.page - 1)}`}
              className={buttonClass("secondary")}
            >
              {t.adminOrdersList.previous}
            </Link>
          )}
          {filters.page < pages && (
            <Link
              href={`${PATH}${orderQuery(filters, filters.page + 1)}`}
              className={buttonClass("secondary")}
            >
              {t.adminOrdersList.next}
            </Link>
          )}
        </div>
      </nav>
    </>
  );
}

// Formulario GET: los filtros quedan en la URL, se pueden compartir y recargar.
function FiltersForm({
  filters,
  t,
  customers,
  cities,
  products,
}: {
  filters: OrderFilters;
  t: Dictionary;
  customers: { id: string; tradeName: string }[];
  cities: { id: number; name: string }[];
  products: { id: string; name: string; sku: string }[];
}) {
  const l = t.adminOrdersList;
  const control = "rounded border border-current/20 bg-transparent px-3 py-2";

  return (
    <form
      action={PATH}
      // key: al cambiar los filtros (p. ej. "Limpiar"), los campos vuelven a la URL.
      key={orderQuery({ ...filters, page: 1 })}
      className="mt-6 flex flex-col gap-4 text-sm"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="flex flex-col gap-1">
          <span className="font-medium">{l.number}</span>
          <input
            type="number"
            name="number"
            min={1}
            defaultValue={filters.number ?? ""}
            className={control}
          />
        </label>
        <Select
          label={l.customer}
          name="customer"
          value={filters.customer}
          all={l.all}
          className={control}
          options={customers.map((c) => ({ value: c.id, label: c.tradeName }))}
        />
        <Select
          label={l.city}
          name="city"
          value={filters.city ? String(filters.city) : undefined}
          all={l.all}
          className={control}
          options={cities.map((c) => ({ value: String(c.id), label: c.name }))}
        />
        <Select
          label={l.product}
          name="product"
          value={filters.product}
          all={l.all}
          className={control}
          options={products.map((p) => ({
            value: p.id,
            label: `${p.name} (${p.sku})`,
          }))}
        />
        <Select
          label={l.paymentMethod}
          name="paymentMethod"
          value={filters.paymentMethod}
          all={l.all}
          className={control}
          options={Object.values(PaymentMethod).map((method) => ({
            value: method,
            label: t.orders.paymentMethods[method],
          }))}
        />
        <label className="flex flex-col gap-1">
          <span className="font-medium">{l.from}</span>
          <input
            type="date"
            name="from"
            defaultValue={filters.from ?? ""}
            className={control}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-medium">{l.to}</span>
          <input
            type="date"
            name="to"
            defaultValue={filters.to ?? ""}
            className={control}
          />
        </label>
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

      <div className="flex gap-3">
        <button type="submit" className={buttonClass()}>
          {l.filter}
        </button>
        {hasOrderFilters(filters) && (
          <Link href={PATH} className={buttonClass("secondary")}>
            {l.clear}
          </Link>
        )}
      </div>
    </form>
  );
}

function Select({
  label,
  name,
  value,
  all,
  options,
  className,
}: {
  label: string;
  name: string;
  value?: string;
  all: string;
  options: { value: string; label: string }[];
  className: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-medium">{label}</span>
      <select name={name} defaultValue={value ?? ""} className={className}>
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

/** Varios valores a la vez; ninguno marcado = todos. */
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
