import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { buttonClass } from "@/components/ui/button";
import { interpolate } from "@/i18n/config";
import { formatters } from "@/i18n/format";
import { getLocale, getT } from "@/i18n/server";
import { getUserWithPermission } from "@/lib/auth";
import { db } from "@/lib/db";

const PATH = "/admin/routes";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.routes.title };
}

export default async function RouteSheetsPage({
  searchParams,
}: PageProps<"/[lang]/admin/routes">) {
  const t = await getT();
  return (
    <main className="mx-auto w-full max-w-5xl p-8">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{t.routes.title}</h1>
        <Link href={`${PATH}/new`} className={buttonClass()}>
          {t.routes.newButton}
        </Link>
      </div>
      {/* El filtro viene de la URL y las hojas de la DB: van en Suspense. */}
      <Suspense
        fallback={<p className="mt-6 text-sm opacity-70">{t.common.loading}</p>}
      >
        <RouteSheets searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function RouteSheets({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await getUserWithPermission("routes:manage");
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const format = formatters(locale);
  const r = t.routes;
  const showClosed = (await searchParams).closed === "1";

  // Las abiertas siempre; las cerradas, a pedido (son el historial).
  const sheets = await db.routeSheet.findMany({
    where: showClosed ? {} : { state: { not: "CLOSED" } },
    orderBy: [{ date: "desc" }, { number: "desc" }],
    take: 100,
    select: {
      number: true,
      date: true,
      state: true,
      driver: { select: { name: true } },
      vehicle: { select: { name: true } },
      _count: { select: { stops: true } },
    },
  });

  return (
    <>
      <p className="mt-4 text-sm">
        <Link
          href={showClosed ? PATH : `${PATH}?closed=1`}
          className="hover:underline"
        >
          {showClosed ? r.showOpen : r.showClosed}
        </Link>
      </p>
      {sheets.length === 0 ? (
        <p className="mt-6 text-sm opacity-70">{r.empty}</p>
      ) : (
        <table className="mt-4 w-full text-left text-sm">
          <thead className="border-b border-current/20">
            <tr>
              <th className="py-2 pr-3 font-medium">{r.columns.number}</th>
              <th className="py-2 pr-3 font-medium">{r.columns.date}</th>
              <th className="py-2 pr-3 font-medium">{r.columns.driver}</th>
              <th className="py-2 pr-3 font-medium">{r.columns.vehicle}</th>
              <th className="py-2 pr-3 font-medium">{r.columns.state}</th>
              <th className="py-2 text-right font-medium">{r.columns.stops}</th>
            </tr>
          </thead>
          <tbody>
            {sheets.map((sheet) => (
              <tr key={sheet.number} className="border-b border-current/10">
                <td className="py-2 pr-3">
                  <Link
                    href={`${PATH}/${sheet.number}`}
                    className="font-medium hover:underline"
                  >
                    #{sheet.number}
                  </Link>
                </td>
                <td className="py-2 pr-3 whitespace-nowrap">
                  {format.date(
                    // `date` es un día sin hora: se muestra ese mismo día.
                    new Date(
                      `${sheet.date.toISOString().slice(0, 10)}T12:00:00-03:00`,
                    ),
                  )}
                </td>
                <td className="py-2 pr-3">{sheet.driver.name}</td>
                <td className="py-2 pr-3">{sheet.vehicle?.name ?? "—"}</td>
                <td className="py-2 pr-3">{r.states[sheet.state]}</td>
                <td className="py-2 text-right">
                  {interpolate(r.stopsCount, { count: sheet._count.stops })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
