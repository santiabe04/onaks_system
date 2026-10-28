import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { interpolate } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionary";
import { formatters } from "@/i18n/format";
import { getLocale, getT } from "@/i18n/server";
import { fromCents, toCents } from "@/lib/account";
import { getUserWithPermission } from "@/lib/auth";
import { getAccountBalances, type AccountBalanceRow } from "@/lib/debtors";

const DAY_MS = 24 * 60 * 60 * 1000;

// Se llama después de `connection()`: la hora es la del request, no la del build.
function currentTime(): number {
  return Date.now();
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.debtors.title };
}

export default async function DebtorsPage() {
  const t = await getT();

  return (
    <main className="mx-auto w-full max-w-5xl p-8">
      <h1 className="text-2xl font-semibold">{t.debtors.title}</h1>
      <p className="mt-1 text-sm opacity-70">{t.debtors.intro}</p>
      {/* Los saldos salen de la DB en cada request: van en Suspense. */}
      <Suspense
        fallback={<p className="mt-6 text-sm opacity-70">{t.common.loading}</p>}
      >
        <Debtors />
      </Suspense>
    </main>
  );
}

async function Debtors() {
  await getUserWithPermission("sales:read-all");
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const format = formatters(locale);
  // La antigüedad se cuenta desde hoy (el del request).
  await connection();
  const now = currentTime();

  const rows = await getAccountBalances();
  const debtors = rows.filter((row) => toCents(row.balance) > BigInt(0));
  const credits = rows.filter((row) => toCents(row.balance) < BigInt(0));
  const sum = (list: AccountBalanceRow[]) =>
    fromCents(
      list.reduce((total, row) => total + toCents(row.balance), BigInt(0)),
    );

  return (
    <>
      <p className="mt-6 flex flex-wrap gap-x-6 text-sm">
        <span className="font-semibold text-red-600">
          {interpolate(t.debtors.totalDebt, {
            amount: format.money(sum(debtors)),
          })}
        </span>
        {credits.length > 0 && (
          <span>
            {interpolate(t.debtors.totalCredit, {
              amount: format.money(sum(credits).replace("-", "")),
            })}
          </span>
        )}
      </p>

      {debtors.length === 0 ? (
        <p className="mt-6 text-sm opacity-70">{t.debtors.empty}</p>
      ) : (
        <BalancesTable rows={debtors} t={t} format={format} now={now} />
      )}

      {credits.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-medium">{t.debtors.credit}</h2>
          <BalancesTable rows={credits} t={t} format={format} now={now} />
        </section>
      )}
    </>
  );
}

function BalancesTable({
  rows,
  t,
  format,
  now,
}: {
  rows: AccountBalanceRow[];
  t: Dictionary;
  format: ReturnType<typeof formatters>;
  now: number;
}) {
  const d = t.debtors;
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-current/20">
          <tr>
            <th className="py-2 pr-3 font-medium">{d.columns.customer}</th>
            <th className="py-2 pr-3 text-right font-medium">
              {d.columns.balance}
            </th>
            <th className="py-2 pr-3 font-medium">{d.columns.oldestUnpaid}</th>
            <th className="py-2 font-medium">{d.columns.lastPayment}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const cents = toCents(row.balance);
            return (
              <tr key={row.id} className="border-b border-current/10">
                <td className="py-2 pr-3">
                  <Link
                    href={`/admin/customers/${row.id}/account`}
                    className="font-medium hover:underline"
                  >
                    {row.tradeName}
                  </Link>
                  {row.deleted && (
                    <span className="ml-2 text-xs opacity-70">
                      ({d.deleted})
                    </span>
                  )}
                </td>
                <td
                  className={`py-2 pr-3 text-right font-semibold whitespace-nowrap ${
                    cents > BigInt(0) ? "text-red-600" : ""
                  }`}
                >
                  {format.money(fromCents(cents < BigInt(0) ? -cents : cents))}
                </td>
                <td className="py-2 pr-3 whitespace-nowrap">
                  {row.oldestUnpaid
                    ? interpolate(d.days, {
                        date: format.date(row.oldestUnpaid),
                        days: Math.floor(
                          (now - row.oldestUnpaid.getTime()) / DAY_MS,
                        ),
                      })
                    : d.never}
                </td>
                <td className="py-2 whitespace-nowrap">
                  {row.lastPayment
                    ? format.date(
                        // `paid_on` es una fecha sin hora: se muestra el mismo día.
                        new Date(
                          `${row.lastPayment.toISOString().slice(0, 10)}T12:00:00-03:00`,
                        ),
                      )
                    : d.never}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
