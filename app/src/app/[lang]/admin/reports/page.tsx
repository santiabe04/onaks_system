import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { MonthlyChart } from "@/components/reports/monthly-chart";
import { buttonClass } from "@/components/ui/button";
import { interpolate } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionary";
import { formatters } from "@/i18n/format";
import { getLocale, getT } from "@/i18n/server";
import { getUserWithPermission } from "@/lib/auth";
import {
  chartMonths,
  parseReportParams,
  REPORT_BASES,
  REPORT_TABS,
  reportQuery,
  type ReportParams,
  type ReportRow,
} from "@/lib/sales-report";
import {
  getMonthlySales,
  getSalesReport,
  type SalesReport,
} from "@/lib/sales-report-queries";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.salesReport.title };
}

export default async function SalesReportPage({
  searchParams,
}: PageProps<"/[lang]/admin/reports">) {
  const t = await getT();

  return (
    <main className="mx-auto w-full max-w-6xl p-4 sm:p-8">
      <h1 className="text-2xl font-semibold">{t.salesReport.title}</h1>
      <p className="mt-1 text-sm opacity-70">{t.salesReport.hint}</p>
      {/* Los filtros vienen de la URL y los datos de la DB: va en Suspense. */}
      <Suspense
        fallback={<p className="mt-6 text-sm opacity-70">{t.common.loading}</p>}
      >
        <Report searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

const CONTROL = "rounded border border-current/20 bg-transparent px-3 py-2";

async function Report({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await getUserWithPermission("reports:read");
  // El período por defecto es el mes actual.
  await connection();
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const params = parseReportParams(await searchParams);
  const months = chartMonths(params);
  const [report, monthly] = await Promise.all([
    getSalesReport(params),
    getMonthlySales(params.basis, months.start, months.end),
  ]);
  const format = formatters(locale);
  const r = t.salesReport;
  const byMonth = new Map(monthly.map((row) => [row.month, row]));

  return (
    <>
      <form
        action="/admin/reports"
        className="mt-6 flex flex-wrap items-end gap-3 text-sm print:hidden"
      >
        <input type="hidden" name="tab" value={params.tab} />
        <label className="flex flex-col gap-1">
          <span className="font-medium">{r.from}</span>
          <input
            type="date"
            name="from"
            defaultValue={params.from}
            className={CONTROL}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-medium">{r.to}</span>
          <input
            type="date"
            name="to"
            defaultValue={params.to}
            className={CONTROL}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-medium">{r.basis}</span>
          <select name="basis" defaultValue={params.basis} className={CONTROL}>
            {REPORT_BASES.map((basis) => (
              <option key={basis} value={basis}>
                {r.bases[basis]}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className={buttonClass()}>
          {r.apply}
        </button>
        <a
          href={`/admin/reports/export${reportQuery(params)}`}
          className={buttonClass("secondary")}
        >
          {r.exportCsv}
        </a>
      </form>

      <Totals totals={report.totals} format={format} t={r} />

      <section className="mt-8">
        <MonthlyChart
          data={months.months.map(
            (month) => byMonth.get(month) ?? { month, net: "0", margin: "0" },
          )}
          locale={locale}
          format={format}
          labels={{ title: r.chartTitle, net: r.net, margin: r.margin }}
        />
      </section>

      <nav
        aria-label={r.title}
        className="mt-8 flex flex-wrap gap-1 border-b border-current/20 text-sm print:hidden"
      >
        {REPORT_TABS.map((tab) => (
          <Link
            key={tab}
            href={`/admin/reports${reportQuery(params, { tab })}`}
            aria-current={tab === params.tab ? "page" : undefined}
            className={`-mb-px rounded-t border px-3 py-2 ${
              tab === params.tab
                ? "border-current/20 border-b-transparent font-medium"
                : "border-transparent opacity-70 hover:opacity-100"
            }`}
          >
            {r.tabs[tab]}
          </Link>
        ))}
      </nav>

      {params.tab === "idle" ? (
        <IdleTable report={report} format={format} t={r} />
      ) : (
        <RowsTable report={report} params={params} format={format} t={r} />
      )}
    </>
  );
}

type Format = ReturnType<typeof formatters>;
type ReportDictionary = Dictionary["salesReport"];

function rate(row: ReportRow, format: Format, t: ReportDictionary) {
  return row.marginRate === null ? t.noCost : format.percent(row.marginRate);
}

function Totals({
  totals,
  format,
  t,
}: {
  totals: ReportRow;
  format: Format;
  t: ReportDictionary;
}) {
  const cards = [
    [t.net, format.money(totals.net)],
    [t.cost, format.money(totals.cost)],
    [t.margin, format.money(totals.margin)],
    [t.marginRate, rate(totals, format, t)],
    [t.orders, format.number(totals.orders)],
  ];
  return (
    <section className="mt-6">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {cards.map(([label, value]) => (
          <div key={label} className="rounded border border-current/20 p-3">
            <dt className="text-xs opacity-70">{label}</dt>
            <dd className="text-lg font-semibold whitespace-nowrap">{value}</dd>
          </div>
        ))}
      </dl>
      {Number(totals.uncostedNet) > 0 && (
        <p className="mt-2 text-xs opacity-70">
          {interpolate(t.uncosted, {
            amount: format.money(totals.uncostedNet),
          })}
        </p>
      )}
    </section>
  );
}

function RowsTable({
  report,
  params,
  format,
  t,
}: {
  report: SalesReport;
  params: ReportParams;
  format: Format;
  t: ReportDictionary;
}) {
  if (report.rows.length === 0) {
    return <p className="mt-6 text-sm opacity-70">{t.empty}</p>;
  }
  const c = t.columns;
  const name = {
    products: c.product,
    categories: c.category,
    customers: c.customer,
    zones: c.zone,
    idle: c.product,
  }[params.tab];
  const byProduct = params.tab === "products";

  return (
    <div className="mt-4 overflow-x-auto print:overflow-visible">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-current/20">
          <tr>
            <th className="py-2 pr-3 font-medium">{name}</th>
            {byProduct && (
              <th className="py-2 pr-3 text-right font-medium">{c.quantity}</th>
            )}
            <th className="py-2 pr-3 text-right font-medium">{c.orders}</th>
            <th className="py-2 pr-3 text-right font-medium">{c.net}</th>
            <th className="py-2 pr-3 text-right font-medium">{c.cost}</th>
            <th className="py-2 pr-3 text-right font-medium">{c.margin}</th>
            <th className="py-2 text-right font-medium">{c.marginRate}</th>
          </tr>
        </thead>
        <tbody>
          {report.rows.map((row) => (
            <tr key={row.key} className="border-b border-current/10 align-top">
              <td className="py-2 pr-3">
                {row.label}
                {row.detail && (
                  <span className="block text-xs opacity-70">{row.detail}</span>
                )}
              </td>
              {byProduct && (
                <td className="py-2 pr-3 text-right whitespace-nowrap">
                  {format.number(row.quantity)}
                </td>
              )}
              <td className="py-2 pr-3 text-right">
                {format.number(row.orders)}
              </td>
              <td className="py-2 pr-3 text-right whitespace-nowrap">
                {format.money(row.net)}
              </td>
              <td className="py-2 pr-3 text-right whitespace-nowrap">
                {format.money(row.cost)}
              </td>
              <td className="py-2 pr-3 text-right whitespace-nowrap">
                {format.money(row.margin)}
              </td>
              <td className="py-2 text-right whitespace-nowrap">
                {rate(row, format, t)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function IdleTable({
  report,
  format,
  t,
}: {
  report: SalesReport;
  format: Format;
  t: ReportDictionary;
}) {
  const c = t.columns;
  return (
    <>
      <p className="mt-4 text-sm opacity-70">{t.idleHint}</p>
      {report.idle.length === 0 ? (
        <p className="mt-4 text-sm opacity-70">{t.idleEmpty}</p>
      ) : (
        <div className="mt-4 overflow-x-auto print:overflow-visible">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-current/20">
              <tr>
                <th className="py-2 pr-3 font-medium">{c.product}</th>
                <th className="py-2 pr-3 font-medium">{c.category}</th>
                <th className="py-2 text-right font-medium">{c.stock}</th>
              </tr>
            </thead>
            <tbody>
              {report.idle.map((product) => (
                <tr
                  key={product.id}
                  className="border-b border-current/10 align-top"
                >
                  <td className="py-2 pr-3">
                    {product.name}
                    <span className="block font-mono text-xs opacity-70">
                      {product.sku}
                    </span>
                  </td>
                  <td className="py-2 pr-3">{product.category}</td>
                  <td className="py-2 text-right whitespace-nowrap">
                    {format.number(product.stock)} {product.unit}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
