import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import type { StockCountState } from "@/generated/prisma/enums";
import { NewCountForm } from "@/components/stock/count-forms";
import { interpolate } from "@/i18n/config";
import { formatters } from "@/i18n/format";
import { getLocale, getT } from "@/i18n/server";
import { getUserWithPermission } from "@/lib/auth";
import { db } from "@/lib/db";

const PATH = "/admin/stock/counts";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.stockCount.title };
}

export default async function StockCountsPage() {
  const t = await getT();
  return (
    <main className="mx-auto w-full max-w-4xl p-4 sm:p-8">
      <Link href="/admin/stock" className="text-sm hover:underline">
        ← {t.stock.title}
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">{t.stockCount.title}</h1>
      <p className="mt-2 max-w-2xl text-sm opacity-70">{t.stockCount.intro}</p>
      {/* The counts come from the DB: they go in Suspense. */}
      <Suspense
        fallback={<p className="mt-6 text-sm opacity-70">{t.common.loading}</p>}
      >
        <Counts />
      </Suspense>
    </main>
  );
}

const STATE_COLOR: Record<StockCountState, string> = {
  OPEN: "text-amber-700 dark:text-amber-400",
  APPROVED: "",
  CANCELED: "text-red-600",
};

async function Counts() {
  await getUserWithPermission("stock:count");
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const format = formatters(locale);
  const s = t.stockCount;

  const [counts, warehouses] = await Promise.all([
    db.stockCount.findMany({
      orderBy: { number: "desc" },
      take: 100,
      select: {
        number: true,
        state: true,
        createdAt: true,
        warehouse: { select: { name: true } },
        _count: { select: { items: true } },
      },
    }),
    db.warehouse.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <>
      {warehouses.length === 0 ? (
        <p className="mt-6 text-sm">{t.stock.noWarehouses}</p>
      ) : (
        <section className="mt-6">
          <h2 className="text-lg font-medium">{s.newCount}</h2>
          <NewCountForm
            warehouses={warehouses.map((w) => ({ id: w.id, label: w.name }))}
            t={s}
          />
        </section>
      )}

      {counts.length === 0 ? (
        <p className="mt-8 text-sm opacity-70">{s.empty}</p>
      ) : (
        <div className="overflow-x-auto print:overflow-visible">
          <table className="mt-8 w-full text-left text-sm">
            <thead className="border-b border-current/20">
              <tr>
                <th className="py-2 pr-3 font-medium">{s.columns.number}</th>
                <th className="py-2 pr-3 font-medium">{s.columns.date}</th>
                <th className="py-2 pr-3 font-medium">{s.warehouse}</th>
                <th className="py-2 pr-3 font-medium">{s.columns.products}</th>
                <th className="py-2 font-medium">{s.columns.state}</th>
              </tr>
            </thead>
            <tbody>
              {counts.map((count) => (
                <tr key={count.number} className="border-b border-current/10">
                  <td className="py-2 pr-3 whitespace-nowrap">
                    <Link
                      href={`${PATH}/${count.number}`}
                      className="font-medium hover:underline"
                    >
                      {interpolate(s.numbered, { number: count.number })}
                    </Link>
                  </td>
                  <td className="py-2 pr-3 whitespace-nowrap">
                    {format.dateTime(count.createdAt)}
                  </td>
                  <td className="py-2 pr-3">{count.warehouse.name}</td>
                  <td className="py-2 pr-3">{count._count.items}</td>
                  <td className={`py-2 ${STATE_COLOR[count.state]}`}>
                    {s.states[count.state]}
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
