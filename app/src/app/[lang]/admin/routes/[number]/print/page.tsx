import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PrintButton } from "@/components/ui/print-button";
import { interpolate } from "@/i18n/config";
import { formatters } from "@/i18n/format";
import { getLocale, getT } from "@/i18n/server";
import { fromCents, toCents } from "@/lib/account";
import { getUserWithPermission } from "@/lib/auth";
import { parseSaleNumber } from "@/lib/checkout";
import { getRouteSheet } from "@/lib/route-sheet-queries";

export async function generateMetadata({
  params,
}: PageProps<"/[lang]/admin/routes/[number]/print">): Promise<Metadata> {
  const t = await getT();
  return {
    title: interpolate(t.routes.detailTitle, {
      number: (await params).number,
    }),
  };
}

// La hoja que se lleva el repartidor: una parada por bloque, con lo que hay
// que entregar, lo que hay que cobrar y lugar para la firma.
export default async function RouteSheetPrintPage({
  params,
}: PageProps<"/[lang]/admin/routes/[number]/print">) {
  const t = await getT();
  return (
    <main className="mx-auto w-full max-w-4xl p-4 sm:p-8 print:p-0">
      {/* params y la hoja son de request: van en Suspense. */}
      <Suspense
        fallback={<p className="text-sm opacity-70">{t.common.loading}</p>}
      >
        <PrintableSheet params={params} />
      </Suspense>
    </main>
  );
}

async function PrintableSheet({
  params,
}: {
  params: Promise<{ number: string }>;
}) {
  await getUserWithPermission("routes:manage");
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const format = formatters(locale);
  const r = t.routes;
  const p = r.print_;

  const number = parseSaleNumber((await params).number);
  if (number === null) notFound();
  const sheet = await getRouteSheet(number);
  if (!sheet) notFound();
  const day = sheet.date.toISOString().slice(0, 10);
  const toCollect = sheet.stops.reduce(
    (sum, stop) => sum + toCents(stop.collect.total),
    BigInt(0),
  );

  return (
    <>
      <div className="mb-4 flex gap-3 print:hidden">
        <PrintButton label={r.print} />
        <Link
          href={`/admin/routes/${sheet.number}`}
          className="self-center text-sm hover:underline"
        >
          ← {interpolate(r.detailTitle, { number: sheet.number })}
        </Link>
      </div>

      <header className="border-b border-current/30 pb-2">
        <h1 className="text-xl font-semibold">
          {interpolate(r.detailTitle, { number: sheet.number })}
        </h1>
        <p className="text-sm">
          {format.date(new Date(`${day}T12:00:00-03:00`))} · {r.driver}:{" "}
          {sheet.driver.name}
          {sheet.driver.phone && ` (${sheet.driver.phone})`}
          {sheet.vehicle &&
            ` · ${r.vehicle}: ${sheet.vehicle.name}${sheet.vehicle.plate ? ` (${sheet.vehicle.plate})` : ""}`}
        </p>
        {sheet.notes && <p className="text-sm">{sheet.notes}</p>}
      </header>

      {sheet.stops.map((stop) => {
        const contact = stop.sale.user.person;
        const balance = toCents(stop.customerBalance);
        return (
          <section
            key={stop.id}
            className="break-inside-avoid border-b border-current/30 py-3 text-sm"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-semibold">
                {interpolate(p.stop, { position: stop.position })} · #
                {stop.sale.number} · {stop.sale.address.customer.tradeName}
              </h2>
              <span>
                {interpolate(t.adminOrders.kg, {
                  value: format.number(stop.load.weight),
                })}
              </span>
            </div>
            <p>
              {stop.sale.address.name}: {stop.sale.address.address},{" "}
              {stop.sale.address.city.name}
              {stop.sale.address.zipCode &&
                ` (CP ${stop.sale.address.zipCode})`}
            </p>
            <p>
              {p.contact}: {contact.name} {contact.surname}
              {contact.phone && ` · ${contact.phone}`}
            </p>
            {stop.sale.notes && <p className="italic">{stop.sale.notes}</p>}

            <ul className="mt-1 grid gap-x-6 sm:grid-cols-2">
              {stop.sale.items.map((item) => (
                <li key={item.productId}>
                  ☐ {format.number(item.quantity)}{" "}
                  {item.product.measurementUnit.name} · {item.product.name}
                </li>
              ))}
            </ul>

            <div className="mt-2 grid gap-4 sm:grid-cols-2">
              <div>
                <p className="font-semibold">
                  {p.toCollect}:{" "}
                  {toCents(stop.collect.total) > BigInt(0)
                    ? format.money(stop.collect.total)
                    : p.nothingToCollect}
                </p>
                {toCents(stop.collect.previousDebt) > BigInt(0) && (
                  <p className="text-xs">
                    {interpolate(p.orderAmount, {
                      amount: format.money(stop.collect.order),
                    })}{" "}
                    ·{" "}
                    {interpolate(p.previousDebt, {
                      amount: format.money(stop.collect.previousDebt),
                    })}
                  </p>
                )}
                {balance < BigInt(0) && (
                  <p className="text-xs">
                    {interpolate(p.credit, {
                      amount: format.money(fromCents(-balance)),
                    })}
                  </p>
                )}
              </div>
              <div className="text-xs">
                <p className="mt-6 border-t border-current/50 pt-1">
                  {p.receivedBy}
                </p>
                <p className="mt-4 border-t border-current/50 pt-1">{p.dni}</p>
              </div>
            </div>
          </section>
        );
      })}

      <footer className="mt-3 text-sm">
        <p className="font-semibold">
          {p.totals}: {interpolate(r.stopsCount, { count: sheet.stops.length })}{" "}
          ·{" "}
          {interpolate(t.adminOrders.kg, {
            value: format.number(sheet.totals.weight),
          })}{" "}
          · {p.toCollect}: {format.money(fromCents(toCollect))}
        </p>
        {sheet.state === "CLOSED" && (
          <p className="mt-2">
            {interpolate(r.closing.cashExpected, {
              amount: format.money(sheet.cashExpected ?? 0),
            })}{" "}
            ·{" "}
            {interpolate(r.closing.received, {
              amount: format.money(sheet.cashReceived ?? 0),
            })}
            {sheet.closingNotes && ` · ${sheet.closingNotes}`}
          </p>
        )}
        <p className="mt-8 w-64 border-t border-current/50 pt-1 text-xs">
          {p.driverSignature}
        </p>
      </footer>
    </>
  );
}
