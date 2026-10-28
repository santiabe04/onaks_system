import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { interpolate } from "@/i18n/config";
import { formatters } from "@/i18n/format";
import { getLocale, getT } from "@/i18n/server";
import { toCents } from "@/lib/account";
import { getUserWithPermission } from "@/lib/auth";
import { parseSaleNumber } from "@/lib/checkout";
import { can } from "@/lib/permissions";
import { canRecordSheet, getRouteSheet } from "@/lib/route-sheet-queries";

export async function generateMetadata({
  params,
}: PageProps<"/[lang]/delivery/[number]">): Promise<Metadata> {
  const t = await getT();
  return {
    title: interpolate(t.delivery.sheet, { number: (await params).number }),
  };
}

export default async function DeliverySheetPage({
  params,
}: PageProps<"/[lang]/delivery/[number]">) {
  const t = await getT();
  return (
    <main className="mx-auto w-full max-w-3xl p-4">
      <Link href="/delivery" className="text-sm hover:underline">
        ← {t.delivery.title}
      </Link>
      {/* params y la hoja son de request: van en Suspense. */}
      <Suspense
        fallback={<p className="mt-6 text-sm opacity-70">{t.common.loading}</p>}
      >
        <Sheet params={params} />
      </Suspense>
    </main>
  );
}

async function Sheet({ params }: { params: Promise<{ number: string }> }) {
  const user = await getUserWithPermission("routes:deliver");
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const format = formatters(locale);
  const d = t.delivery;

  const number = parseSaleNumber((await params).number);
  if (number === null) notFound();
  const sheet = await getRouteSheet(number);
  // Una hoja ajena se ve igual que una que no existe.
  if (
    !sheet ||
    !canRecordSheet(sheet, {
      id: user.id,
      canManage: can(user.role, "routes:manage"),
    })
  ) {
    notFound();
  }

  return (
    <>
      <h1 className="mt-2 text-2xl font-semibold">
        {interpolate(d.sheet, { number: sheet.number })}
      </h1>
      <p className="text-sm opacity-70">
        {interpolate(d.progress, {
          done: sheet.stops.filter((stop) => stop.status !== "PENDING").length,
          total: sheet.stops.length,
        })}
      </p>
      <ol className="mt-4 flex flex-col gap-3">
        {sheet.stops.map((stop) => (
          <li key={stop.id}>
            <Link
              href={`/delivery/${sheet.number}/${stop.position}`}
              className={`block rounded border p-4 hover:bg-current/5 ${
                stop.status === "PENDING"
                  ? "border-current/40"
                  : "border-current/10 opacity-60"
              }`}
            >
              <span className="flex items-baseline justify-between gap-2">
                <span className="font-semibold">
                  {stop.position}. {stop.sale.address.customer.tradeName}
                </span>
                <span className="text-sm">{d.statuses[stop.status]}</span>
              </span>
              <span className="block text-sm">
                {stop.sale.address.address}, {stop.sale.address.city.name}
              </span>
              {toCents(stop.collect.total) > BigInt(0) && (
                <span className="block text-sm font-medium">
                  {interpolate(d.toCollect, {
                    amount: format.money(stop.collect.total),
                  })}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ol>
    </>
  );
}
