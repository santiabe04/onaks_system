import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { buttonClass } from "@/components/ui/button";
import { interpolate } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionary";
import { formatters } from "@/i18n/format";
import { getLocale, getT } from "@/i18n/server";
import { getUserWithPermission } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  MAX_RANGE_DAYS,
  parseOrderPeriod,
  periodQuery,
  type OrderPeriod,
} from "@/lib/order-period";
import { groupOrdersByZone, type Totals } from "@/lib/orders-by-zone";

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
  await getUserWithPermission("sales:read-all");
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const format = formatters(locale);
  const now = new Date();
  const period = parseOrderPeriod(await searchParams, now);

  // Los cancelados no se reparten: quedan fuera de la agrupación.
  const sales = await db.sale.findMany({
    where: {
      createdAt: { gte: period.start, lt: period.end },
      state: { not: "CANCELED" },
    },
    orderBy: { number: "asc" },
    select: {
      number: true,
      createdAt: true,
      state: true,
      paymentMethod: true,
      paymentState: true,
      total: true,
      address: {
        select: {
          name: true,
          address: true,
          customer: { select: { tradeName: true } },
          city: {
            select: { id: true, name: true, state: { select: { name: true } } },
          },
        },
      },
      items: { select: { quantity: true, unitWeight: true, unitVolume: true } },
    },
  });
  const { zones, totals } = groupOrdersByZone(
    sales.map((sale) => ({
      ...sale,
      cityId: sale.address.city.id,
      cityName: sale.address.city.name,
      stateName: sale.address.city.state.name,
    })),
    locale,
  );

  return (
    <>
      <PeriodControls
        period={period}
        isCurrent={periodQuery(period, now) === ""}
        t={t.adminOrders}
        formatDay={(day) => format.date(new Date(`${day}T12:00:00-03:00`))}
      />

      {zones.length === 0 ? (
        <p className="mt-8 text-sm opacity-70">{t.adminOrders.empty}</p>
      ) : (
        <>
          <section className="mt-8 rounded border border-current/20 p-4">
            <h2 className="font-semibold">{t.adminOrders.periodTotal}</h2>
            <TotalsLine totals={totals} t={t} format={format} />
            <p className="mt-1 text-xs opacity-70">
              {t.adminOrders.excludesCanceled}
            </p>
          </section>

          {zones.map((zone) => (
            <section key={zone.cityId} className="mt-8">
              <h2 className="text-lg font-semibold">
                {zone.cityName}{" "}
                <span className="text-sm font-normal opacity-70">
                  ({zone.stateName})
                </span>
              </h2>
              <TotalsLine totals={zone.totals} t={t} format={format} />
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-current/20">
                    <tr>
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
}: {
  totals: Totals;
  t: Dictionary;
  format: ReturnType<typeof formatters>;
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
}: {
  period: OrderPeriod;
  isCurrent: boolean;
  t: Dictionary["adminOrders"];
  formatDay: (day: string) => string;
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
            href={`${PATH}?week=${period.previousWeek}`}
            className={buttonClass("secondary")}
          >
            {t.previousWeek}
          </Link>
        )}
        <span className="font-medium">{label}</span>
        {period.mode === "week" && (
          <Link
            href={`${PATH}?week=${period.nextWeek}`}
            className={buttonClass("secondary")}
          >
            {t.nextWeek}
          </Link>
        )}
        {!isCurrent && (
          <Link href={PATH} className="hover:underline">
            {t.thisWeek}
          </Link>
        )}
      </div>
      {period.mode === "week" && (
        <p className="-mt-2 text-xs opacity-70">{t.weekHint}</p>
      )}

      <form
        action={PATH}
        className="flex flex-wrap items-end gap-3 text-sm"
        // key: al cambiar de período, los inputs vuelven a sus valores.
        key={`${period.from}-${period.to}`}
      >
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
