import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { interpolate } from "@/i18n/config";
import { formatters } from "@/i18n/format";
import { getLocale, getT } from "@/i18n/server";
import { getUserWithPermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getDeliverySheets } from "@/lib/route-sheet-queries";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.delivery.title };
}

export default async function DeliveryPage() {
  const t = await getT();

  return (
    <main className="mx-auto w-full max-w-3xl p-4">
      <h1 className="text-2xl font-semibold">{t.delivery.title}</h1>
      {/* Las hojas salen de la DB en cada request: van en Suspense. */}
      <Suspense
        fallback={<p className="mt-6 text-sm opacity-70">{t.common.loading}</p>}
      >
        <Deliveries />
      </Suspense>
    </main>
  );
}

async function Deliveries() {
  const user = await getUserWithPermission("routes:deliver");
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const format = formatters(locale);
  // El repartidor ve sus hojas; un admin, todas las que están en reparto.
  const sheets = await getDeliverySheets({
    id: user.id,
    canManage: can(user.role, "routes:manage"),
  });

  if (sheets.length === 0) {
    return <p className="mt-6 text-sm opacity-70">{t.delivery.empty}</p>;
  }
  return (
    <ul className="mt-4 flex flex-col gap-3">
      {sheets.map((sheet) => (
        <li key={sheet.number}>
          <Link
            href={`/delivery/${sheet.number}`}
            className="block rounded border border-current/20 p-4 hover:bg-current/5"
          >
            <span className="text-lg font-semibold">
              {interpolate(t.delivery.sheet, { number: sheet.number })}
            </span>
            <span className="block text-sm opacity-70">
              {format.date(
                // `date` es un día sin hora: se muestra ese mismo día.
                new Date(
                  `${sheet.date.toISOString().slice(0, 10)}T12:00:00-03:00`,
                ),
              )}{" "}
              · {sheet.driver.name}
            </span>
            <span className="mt-1 block text-sm">
              {interpolate(t.delivery.progress, {
                done: sheet.done,
                total: sheet.total,
              })}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
