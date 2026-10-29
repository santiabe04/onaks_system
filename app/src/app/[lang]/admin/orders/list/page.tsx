import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import {
  FilterInput,
  OrderFilterFields,
} from "@/components/orders/order-filter-fields";
import { PickingFromSelection } from "@/components/picking/picking-forms";
import {
  BulkStateBar,
  SelectGroup,
  SelectOrder,
} from "@/components/orders/bulk-state-bar";
import { buttonClass } from "@/components/ui/button";
import { interpolate } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionary";
import { formatters } from "@/i18n/format";
import { getLocale, getT } from "@/i18n/server";
import { getUserWithPermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import {
  getOrderFilterOptions,
  type OrderFilterOptions,
} from "@/lib/order-filter-options";
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
    <main className="mx-auto w-full max-w-6xl p-4 sm:p-8">
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
  const user = await getUserWithPermission("sales:read-all");
  const canManage = can(user.role, "sales:manage");
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const format = formatters(locale);
  const filters = parseOrderFilters(await searchParams);
  const where = orderWhere(filters);

  const [options, summary, sales, warehouses] = await Promise.all([
    getOrderFilterOptions(),
    db.sale.aggregate({ where, _count: true, _sum: { total: true } }),
    db.sale.findMany({
      where,
      orderBy: { number: "desc" },
      skip: (filters.page - 1) * ORDERS_PAGE_SIZE,
      take: ORDERS_PAGE_SIZE,
      select: {
        id: true,
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
    // Para el cambio masivo: depósitos activos.
    db.warehouse.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);
  const product = options.products.find((p) => p.id === filters.product);
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
      <FiltersForm filters={filters} t={t} options={options} />

      {total === 0 ? (
        <p className="mt-6 text-sm opacity-70">{t.adminOrdersList.empty}</p>
      ) : (
        <>
          {canManage && (
            <>
              <BulkStateBar
                warehouses={warehouses}
                t={t.adminOrders.bulk}
                states={t.orders.states}
              />
              <PickingFromSelection warehouses={warehouses} t={t.picking} />
            </>
          )}
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

          <div className="mt-3 overflow-x-auto print:overflow-visible">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-current/20">
                <tr>
                  {canManage && (
                    <th className="w-6 py-2 pr-2">
                      <SelectGroup label={t.adminOrders.bulk.selectAll} />
                    </th>
                  )}
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
                    {canManage && (
                      <td className="py-2 pr-2">
                        <SelectOrder
                          id={sale.id}
                          state={sale.state}
                          number={sale.number}
                          label={t.adminOrders.bulk.selectOrder}
                        />
                      </td>
                    )}
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
  options,
}: {
  filters: OrderFilters;
  t: Dictionary;
  options: OrderFilterOptions;
}) {
  const l = t.adminOrdersList;
  return (
    <form
      action={PATH}
      // key: al cambiar los filtros (p. ej. "Limpiar"), los campos vuelven a la URL.
      key={orderQuery({ ...filters, page: 1 })}
      className="mt-6 flex flex-col gap-4 text-sm"
    >
      <OrderFilterFields filters={filters} options={options} t={t}>
        <FilterInput
          label={l.number}
          type="number"
          name="number"
          min={1}
          defaultValue={filters.number ?? ""}
        />
        <FilterInput
          label={l.from}
          type="date"
          name="from"
          defaultValue={filters.from ?? ""}
        />
        <FilterInput
          label={l.to}
          type="date"
          name="to"
          defaultValue={filters.to ?? ""}
        />
      </OrderFilterFields>

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
