import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import {
  BulkStateBar,
  SelectGroup,
  SelectOrder,
} from "@/components/orders/bulk-state-bar";
import { OrderFilterFields } from "@/components/orders/order-filter-fields";
import { PickingFromSelection } from "@/components/picking/picking-forms";
import { RouteFromSelection } from "@/components/routes/route-forms";
import { buttonClass } from "@/components/ui/button";
import { PrintButton } from "@/components/ui/print-button";
import { interpolate } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionary";
import { formatters } from "@/i18n/format";
import { getLocale, getT } from "@/i18n/server";
import { getUserWithPermission } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  isoDay,
  MAX_RANGE_DAYS,
  parseOrderPeriod,
  periodQuery,
  type OrderPeriod,
} from "@/lib/order-period";
import {
  getOrderFilterOptions,
  type OrderFilterOptions,
} from "@/lib/order-filter-options";
import {
  parseOrderFilters,
  zoneFilterParams,
  type ZoneFilters,
} from "@/lib/order-filters";
import {
  groupOrdersByZone,
  productQuantity,
  type Totals,
} from "@/lib/orders-by-zone";
import { getPeriodOrders } from "@/lib/orders-by-zone-queries";
import { getFleetOptions } from "@/lib/route-sheet-queries";
import { can } from "@/lib/permissions";

const PATH = "/admin/orders";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.adminOrders.title };
}

export default async function OrdersByZonePage({
  searchParams,
}: PageProps<"/[lang]/admin/orders">) {
  const t = await getT();

  return (
    <main className="mx-auto w-full max-w-6xl p-8">
      <h1 className="text-2xl font-semibold">{t.adminOrders.title}</h1>
      {/* El período viene de la URL y los pedidos de la DB: van en Suspense. */}
      <Suspense
        fallback={<p className="mt-6 text-sm opacity-70">{t.common.loading}</p>}
      >
        <OrdersByZone searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function OrdersByZone({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getUserWithPermission("sales:read-all");
  const canManage = can(user.role, "sales:manage");
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const format = formatters(locale);
  // La semana actual depende de la hora del request, no de la del build.
  await connection();
  const now = new Date();
  const params = await searchParams;
  const period = parseOrderPeriod(params, now);
  // Los mismos filtros que la lista, salvo número y fechas (el período manda).
  const filters = parseOrderFilters(params);
  const filterParams = zoneFilterParams(filters);

  const [orders, options, warehouses, fleet] = await Promise.all([
    getPeriodOrders(period, filters),
    getOrderFilterOptions(),
    // Para el cambio masivo: depósitos activos.
    db.warehouse.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    getFleetOptions(),
  ]);
  const { zones, totals } = groupOrdersByZone(orders, locale);
  const product = options.products.find((p) => p.id === filters.product);
  const productLine = (list: typeof orders) =>
    product &&
    interpolate(t.adminOrders.productLine, {
      product: product.name,
      quantity: format.number(productQuantity(list, product.id)),
      unit: product.measurementUnit.name,
    });

  /** Período + filtros en una URL: navegar entre semanas no pierde los filtros. */
  const withFilters = (base: [string, string][]) => {
    const query = new URLSearchParams([...base, ...filterParams]).toString();
    return query ? `?${query}` : "";
  };
  // El CSV y el form de filtros siempre llevan el período explícito.
  const periodParams: [string, string][] =
    period.mode === "range"
      ? [
          ["from", period.from],
          ["to", period.to],
        ]
      : [["week", period.from]];
  const activeFilters = describeFilters(filters, options, t);

  return (
    <>
      <PeriodControls
        period={period}
        isCurrent={periodQuery(period, now) === ""}
        t={t.adminOrders}
        formatDay={(day) => format.date(new Date(`${day}T12:00:00-03:00`))}
        withFilters={withFilters}
        filterParams={filterParams}
      />

      <details
        className="mt-4 text-sm print:hidden"
        open={filterParams.length > 0}
      >
        <summary className="cursor-pointer font-medium">
          {t.adminOrders.filters}
          {filterParams.length > 0 && ` (${filterParams.length})`}
        </summary>
        <form
          action={PATH}
          key={withFilters(periodParams)}
          className="mt-3 flex flex-col gap-4"
        >
          {/* El período elegido viaja con los filtros. */}
          {periodParams.map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
          <OrderFilterFields filters={filters} options={options} t={t} />
          <div className="flex gap-3">
            <button type="submit" className={buttonClass()}>
              {t.adminOrdersList.filter}
            </button>
            {filterParams.length > 0 && (
              <Link
                href={`${PATH}?${new URLSearchParams(periodParams)}`}
                className={buttonClass("secondary")}
              >
                {t.adminOrdersList.clear}
              </Link>
            )}
          </div>
        </form>
      </details>
      {activeFilters && (
        <p className="mt-2 text-sm">
          {interpolate(t.adminOrders.activeFilters, {
            filters: activeFilters,
          })}
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-3 print:hidden">
        <PrintButton label={t.adminOrders.print} />
        <a
          href={`${PATH}/export${withFilters(periodParams)}`}
          className={buttonClass("secondary")}
        >
          {t.adminOrders.exportCsv}
        </a>
      </div>
      {canManage && zones.length > 0 && (
        <>
          <BulkStateBar
            warehouses={warehouses}
            t={t.adminOrders.bulk}
            states={t.orders.states}
          />
          <PickingFromSelection warehouses={warehouses} t={t.picking} />
          {can(user.role, "routes:manage") && (
            <RouteFromSelection
              options={fleet}
              today={isoDay(now)}
              t={t.routes}
            />
          )}
        </>
      )}
      <p className="hidden text-xs opacity-70 print:block">
        {interpolate(t.adminOrders.printedAt, {
          date: format.dateTime(now),
        })}
      </p>

      {zones.length === 0 ? (
        <p className="mt-8 text-sm opacity-70">{t.adminOrders.empty}</p>
      ) : (
        <>
          <section className="mt-8 rounded border border-current/20 p-4">
            <h2 className="font-semibold">{t.adminOrders.periodTotal}</h2>
            <TotalsLine
              totals={totals}
              t={t}
              format={format}
              productLine={productLine(orders)}
            />
            {filters.states.length === 0 && (
              <p className="mt-1 text-xs opacity-70">
                {t.adminOrders.excludesCanceled}
              </p>
            )}
          </section>

          {zones.map((zone) => (
            <section
              key={zone.cityId}
              className="mt-8 print:break-inside-avoid-page"
            >
              <h2 className="text-lg font-semibold">
                {zone.cityName}{" "}
                <span className="text-sm font-normal opacity-70">
                  ({zone.stateName})
                </span>
              </h2>
              <TotalsLine
                totals={zone.totals}
                t={t}
                format={format}
                productLine={productLine(zone.orders)}
              />
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-current/20">
                    <tr>
                      {canManage && (
                        <th className="w-6 py-2 pr-2 print:hidden">
                          <SelectGroup
                            group={String(zone.cityId)}
                            label={interpolate(t.adminOrders.bulk.selectGroup, {
                              group: zone.cityName,
                            })}
                          />
                        </th>
                      )}
                      <th className="py-2 pr-3 font-medium">
                        {t.adminOrders.columns.number}
                      </th>
                      <th className="py-2 pr-3 font-medium">
                        {t.adminOrders.columns.date}
                      </th>
                      <th className="py-2 pr-3 font-medium">
                        {t.adminOrders.columns.customer}
                      </th>
                      <th className="py-2 pr-3 font-medium">
                        {t.adminOrders.columns.address}
                      </th>
                      <th className="py-2 pr-3 font-medium">
                        {t.adminOrders.columns.state}
                      </th>
                      <th className="py-2 pr-3 font-medium">
                        {t.adminOrders.columns.payment}
                      </th>
                      {product && (
                        <th className="py-2 pr-3 text-right font-medium">
                          {t.adminOrdersList.columns.productQuantity}
                        </th>
                      )}
                      <th className="py-2 pr-3 text-right font-medium">
                        {t.adminOrders.columns.weight}
                      </th>
                      <th className="py-2 pr-3 text-right font-medium">
                        {t.adminOrders.columns.volume}
                      </th>
                      <th className="py-2 text-right font-medium">
                        {t.adminOrders.columns.total}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {zone.orders.map((sale) => (
                      <tr
                        key={sale.number}
                        className="border-b border-current/10 align-top"
                      >
                        {canManage && (
                          <td className="py-2 pr-2 print:hidden">
                            <SelectOrder
                              id={sale.id}
                              state={sale.state}
                              number={sale.number}
                              group={String(zone.cityId)}
                              label={t.adminOrders.bulk.selectOrder}
                            />
                          </td>
                        )}
                        <td className="py-2 pr-3">
                          <Link
                            href={`${PATH}/${sale.number}`}
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
                        <td className="py-2 pr-3">
                          {sale.address.name}
                          <span className="block text-xs opacity-70">
                            {sale.address.address}
                          </span>
                        </td>
                        <td className="py-2 pr-3">
                          {t.orders.states[sale.state]}
                        </td>
                        <td className="py-2 pr-3">
                          {t.orders.paymentMethods[sale.paymentMethod]}
                          <span className="block text-xs opacity-70">
                            {t.orders.paymentStates[sale.paymentState]}
                          </span>
                        </td>
                        {product && (
                          <td className="py-2 pr-3 text-right whitespace-nowrap">
                            {format.number(productQuantity([sale], product.id))}{" "}
                            {product.measurementUnit.name}
                          </td>
                        )}
                        <td className="py-2 pr-3 text-right whitespace-nowrap">
                          {interpolate(t.adminOrders.kg, {
                            value: format.number(sale.weight),
                          })}
                        </td>
                        <td className="py-2 pr-3 text-right whitespace-nowrap">
                          {interpolate(t.adminOrders.liters, {
                            value: format.number(sale.volume),
                          })}
                        </td>
                        <td className="py-2 text-right whitespace-nowrap">
                          {format.money(sale.total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </>
      )}
    </>
  );
}

/** "3 pedidos · 91,25 kg · 240 l · $ 92.136,75 (Efectivo $ … · Transferencia $ …)". */
function TotalsLine({
  totals,
  t,
  format,
  productLine,
}: {
  totals: Totals;
  t: Dictionary;
  format: ReturnType<typeof formatters>;
  /** Con el filtro de producto: cuánto se pidió de él. */
  productLine?: string;
}) {
  const byMethod = Object.entries(totals.byPaymentMethod) as [
    keyof Dictionary["orders"]["paymentMethods"],
    string,
  ][];
  return (
    <>
      <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <span>
          {interpolate(t.adminOrders.count, {
            count: format.number(totals.count),
          })}
        </span>
        <span>
          {interpolate(t.adminOrders.kg, {
            value: format.number(totals.weight),
          })}
        </span>
        <span>
          {interpolate(t.adminOrders.liters, {
            value: format.number(totals.volume),
          })}
          {totals.missingVolume && (
            <span title={t.adminOrders.missingVolume}> *</span>
          )}
        </span>
        <span className="font-semibold">{format.money(totals.total)}</span>
        {productLine && <span className="font-semibold">{productLine}</span>}
        {byMethod.length > 1 &&
          byMethod.map(([method, amount]) => (
            <span key={method} className="opacity-70">
              {t.orders.paymentMethods[method]} {format.money(amount)}
            </span>
          ))}
        {byMethod.length === 1 && (
          <span className="opacity-70">
            {t.orders.paymentMethods[byMethod[0][0]]}
          </span>
        )}
      </p>
      {totals.missingVolume && (
        <p className="text-xs opacity-70">* {t.adminOrders.missingVolume}</p>
      )}
    </>
  );
}

// Formulario GET: el período queda en la URL, se puede compartir y recargar.
function PeriodControls({
  period,
  isCurrent,
  t,
  formatDay,
  withFilters,
  filterParams,
}: {
  period: OrderPeriod;
  isCurrent: boolean;
  t: Dictionary["adminOrders"];
  formatDay: (day: string) => string;
  /** Arma la URL de un período sin perder los filtros aplicados. */
  withFilters: (base: [string, string][]) => string;
  filterParams: [string, string][];
}) {
  const control = "rounded border border-current/20 bg-transparent px-3 py-2";
  const label = interpolate(period.mode === "week" ? t.week : t.range, {
    from: formatDay(period.from),
    to: formatDay(period.to),
  });

  return (
    <div className="mt-6 flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        {period.mode === "week" && (
          <Link
            href={`${PATH}${withFilters([["week", period.previousWeek!]])}`}
            className={`${buttonClass("secondary")} print:hidden`}
          >
            {t.previousWeek}
          </Link>
        )}
        <span className="font-medium">{label}</span>
        {period.mode === "week" && (
          <Link
            href={`${PATH}${withFilters([["week", period.nextWeek!]])}`}
            className={`${buttonClass("secondary")} print:hidden`}
          >
            {t.nextWeek}
          </Link>
        )}
        {!isCurrent && (
          <Link
            href={`${PATH}${withFilters([])}`}
            className="hover:underline print:hidden"
          >
            {t.thisWeek}
          </Link>
        )}
      </div>
      {period.mode === "week" && (
        <p className="-mt-2 text-xs opacity-70 print:hidden">{t.weekHint}</p>
      )}

      <form
        action={PATH}
        className="flex flex-wrap items-end gap-3 text-sm print:hidden"
        // key: al cambiar de período, los inputs vuelven a sus valores.
        key={`${period.from}-${period.to}`}
      >
        {filterParams.map(([name, value]) => (
          <input
            key={`${name}-${value}`}
            type="hidden"
            name={name}
            value={value}
          />
        ))}
        <label className="flex flex-col gap-1">
          <span className="font-medium">{t.from}</span>
          <input
            type="date"
            name="from"
            defaultValue={period.from}
            required
            className={control}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-medium">{t.to}</span>
          <input
            type="date"
            name="to"
            defaultValue={period.to}
            required
            className={control}
          />
        </label>
        <button type="submit" className={buttonClass()}>
          {t.apply}
        </button>
        <span className="text-xs opacity-70">
          {interpolate(t.rangeHint, { max: MAX_RANGE_DAYS })}
        </span>
      </form>
    </div>
  );
}

/** "Pendiente, En preparación · Lanús · Piedras sanitarias 4 kg": en pantalla y en papel. */
function describeFilters(
  filters: ZoneFilters,
  options: OrderFilterOptions,
  t: Dictionary,
): string {
  return [
    filters.states.map((state) => t.orders.states[state]).join(", "),
    filters.paymentStates
      .map((state) => t.orders.paymentStates[state])
      .join(", "),
    filters.paymentMethod && t.orders.paymentMethods[filters.paymentMethod],
    options.customers.find((c) => c.id === filters.customer)?.tradeName,
    options.cities.find((c) => c.id === filters.city)?.name,
    options.products.find((p) => p.id === filters.product)?.name,
  ]
    .filter(Boolean)
    .join(" · ");
}
