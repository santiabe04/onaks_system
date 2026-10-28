import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { SheetActionButton } from "@/components/routes/route-forms";
import { StopRecordSummary } from "@/components/routes/stop-record-summary";
import { interpolate } from "@/i18n/config";
import { formatters } from "@/i18n/format";
import { getLocale, getT } from "@/i18n/server";
import { toCents } from "@/lib/account";
import { getUserWithPermission } from "@/lib/auth";
import { parseSaleNumber } from "@/lib/checkout";
import { can } from "@/lib/permissions";
import { canRecordSheet, getRouteSheet } from "@/lib/route-sheet-queries";
import { undoStop } from "../../actions";
import { StopForm } from "./stop-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.delivery.title };
}

export default async function DeliveryStopPage({
  params,
}: PageProps<"/[lang]/delivery/[number]/[position]">) {
  const t = await getT();
  return (
    <main className="mx-auto w-full max-w-3xl p-4">
      {/* params y la parada son de request: van en Suspense. */}
      <Suspense
        fallback={<p className="text-sm opacity-70">{t.common.loading}</p>}
      >
        <Stop params={params} />
      </Suspense>
    </main>
  );
}

async function Stop({
  params,
}: {
  params: Promise<{ number: string; position: string }>;
}) {
  const user = await getUserWithPermission("routes:deliver");
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const format = formatters(locale);
  const d = t.delivery;
  const canManage = can(user.role, "routes:manage");

  const { number: rawNumber, position: rawPosition } = await params;
  const number = parseSaleNumber(rawNumber);
  const position = parseSaleNumber(rawPosition);
  if (number === null || position === null) notFound();
  const sheet = await getRouteSheet(number);
  if (!sheet || !canRecordSheet(sheet, { id: user.id, canManage })) {
    notFound();
  }
  const stop = sheet.stops.find((item) => item.position === position);
  if (!stop) notFound();

  const sale = stop.sale;
  const contact = sale.user.person;
  const address = `${sale.address.address}, ${sale.address.city.name}, ${sale.address.city.state.name}, Argentina`;
  const collect = toCents(stop.collect.total);

  return (
    <>
      <Link
        href={`/delivery/${sheet.number}`}
        className="text-sm hover:underline"
      >
        {d.backToSheet}
      </Link>
      <p className="mt-2 text-sm opacity-70">
        {interpolate(d.stop, { position: stop.position })} · #{sale.number}
      </p>
      <h1 className="text-2xl font-semibold">
        {sale.address.customer.tradeName}
      </h1>
      <p>
        {sale.address.address}, {sale.address.city.name}
        {sale.address.zipCode && ` (CP ${sale.address.zipCode})`}
      </p>
      <div className="mt-2 flex flex-wrap gap-4 text-sm">
        <a
          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`}
          target="_blank"
          rel="noreferrer"
          className="underline"
        >
          {d.map}
        </a>
        {contact.phone && (
          <a href={`tel:${contact.phone}`} className="underline">
            {d.call}: {contact.name} {contact.surname}
          </a>
        )}
      </div>
      {sale.notes && <p className="mt-2 text-sm italic">{sale.notes}</p>}

      <section className="mt-4 text-sm">
        <h2 className="font-medium">{d.items}</h2>
        <ul>
          {sale.items.map((item) => (
            <li key={item.productId}>
              {format.number(item.quantity)} {item.product.measurementUnit.name}{" "}
              · {item.product.name}
            </li>
          ))}
        </ul>
        {collect > BigInt(0) && (
          <p className="mt-2 text-lg font-semibold">
            {interpolate(d.toCollect, {
              amount: format.money(stop.collect.total),
            })}
          </p>
        )}
      </section>

      <section className="mt-6">
        {stop.status === "PENDING" ? (
          sheet.state === "OUT" ? (
            <StopForm
              stopId={stop.id}
              suggestedAmount={
                collect > BigInt(0) ? format.input(stop.collect.total) : ""
              }
              t={d}
              methods={t.orders.paymentMethods}
            />
          ) : (
            <p className="text-sm opacity-70">{d.errors.notOut}</p>
          )
        ) : (
          <div className="flex flex-col gap-4">
            <StopRecordSummary
              stop={stop}
              t={d}
              methods={t.orders.paymentMethods}
              format={format}
            />
            {canManage && sheet.state === "OUT" && (
              <SheetActionButton
                action={undoStop.bind(null, stop.id)}
                label={d.undo}
                confirm={d.undoConfirm}
                variant="danger"
              />
            )}
          </div>
        )}
      </section>
    </>
  );
}
