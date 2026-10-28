import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import {
  AddStopsForm,
  RouteSheetForm,
  SheetActionButton,
} from "@/components/routes/route-forms";
import { buttonClass } from "@/components/ui/button";
import { interpolate } from "@/i18n/config";
import { formatters } from "@/i18n/format";
import { getLocale, getT } from "@/i18n/server";
import { getUserWithPermission } from "@/lib/auth";
import { parseSaleNumber } from "@/lib/checkout";
import { checkCapacity } from "@/lib/route-sheet";
import {
  getFleetOptions,
  getRouteCandidates,
  getRouteSheet,
} from "@/lib/route-sheet-queries";
import {
  deleteRouteSheet,
  departRouteSheet,
  moveStopAction,
  removeStop,
  undoDeparture,
  updateRouteSheet,
} from "../actions";

const PATH = "/admin/routes";

export async function generateMetadata({
  params,
}: PageProps<"/[lang]/admin/routes/[number]">): Promise<Metadata> {
  const t = await getT();
  return {
    title: interpolate(t.routes.detailTitle, {
      number: (await params).number,
    }),
  };
}

export default async function RouteSheetPage({
  params,
}: PageProps<"/[lang]/admin/routes/[number]">) {
  const t = await getT();
  return (
    <main className="mx-auto w-full max-w-5xl p-8">
      <Link href={PATH} className="text-sm hover:underline">
        ← {t.routes.title}
      </Link>
      {/* params y la hoja son de request: van en Suspense. */}
      <Suspense
        fallback={<p className="mt-6 text-sm opacity-70">{t.common.loading}</p>}
      >
        <RouteSheet params={params} />
      </Suspense>
    </main>
  );
}

async function RouteSheet({ params }: { params: Promise<{ number: string }> }) {
  await getUserWithPermission("routes:manage");
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const format = formatters(locale);
  const r = t.routes;

  // Mismo parser que el número de pedido: entero positivo.
  const number = parseSaleNumber((await params).number);
  if (number === null) notFound();
  const sheet = await getRouteSheet(number);
  if (!sheet) notFound();

  const draft = sheet.state === "DRAFT";
  const [options, candidates] = draft
    ? await Promise.all([getFleetOptions(), getRouteCandidates()])
    : [null, []];
  const capacity = checkCapacity(sheet.totals, sheet.vehicle);
  const day = sheet.date.toISOString().slice(0, 10);

  return (
    <>
      <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold">
          {interpolate(r.detailTitle, { number: sheet.number })}
        </h1>
        <span className="rounded border border-current/20 px-2 py-0.5 text-sm">
          {r.states[sheet.state]}
        </span>
      </div>
      <p className="mt-1 text-sm">
        {format.date(new Date(`${day}T12:00:00-03:00`))} · {sheet.driver.name}
        {sheet.vehicle &&
          ` · ${sheet.vehicle.name}${sheet.vehicle.plate ? ` (${sheet.vehicle.plate})` : ""}`}
      </p>
      {sheet.notes && <p className="mt-1 text-sm opacity-70">{sheet.notes}</p>}

      <div className="mt-4 flex flex-wrap items-start gap-3">
        {draft && sheet.stops.length > 0 && (
          <SheetActionButton
            action={departRouteSheet.bind(null, sheet.id)}
            label={r.depart}
            pendingLabel={r.working}
            variant="primary"
          />
        )}
        {sheet.state === "OUT" && (
          <SheetActionButton
            action={undoDeparture.bind(null, sheet.id)}
            label={r.undoDepart}
            pendingLabel={r.working}
          />
        )}
        <Link
          href={`${PATH}/${sheet.number}/print`}
          className={buttonClass("secondary")}
        >
          {r.print}
        </Link>
        {draft && (
          <SheetActionButton
            action={deleteRouteSheet.bind(null, sheet.id)}
            label={r.deleteSheet}
            confirm={interpolate(r.confirmDelete, { number: sheet.number })}
            variant="danger"
          />
        )}
      </div>
      <p className="mt-1 text-xs opacity-70">
        {draft ? r.departHint : sheet.state === "OUT" ? r.undoDepartHint : ""}
      </p>

      <section className="mt-6 rounded border border-current/20 p-4 text-sm">
        <h2 className="font-medium">{r.load}</h2>
        <p>
          {interpolate(r.stopsCount, { count: sheet.stops.length })} ·{" "}
          {interpolate(t.adminOrders.kg, {
            value: format.number(sheet.totals.weight),
          })}{" "}
          ·{" "}
          {interpolate(t.adminOrders.liters, {
            value: format.number(sheet.totals.volume),
          })}{" "}
          · {format.money(sheet.totals.total)}
        </p>
        {capacity.overWeight && sheet.vehicle?.capacityKg && (
          <p role="alert" className="mt-1 font-medium text-red-600">
            {interpolate(r.overWeight, {
              capacity: format.number(sheet.vehicle.capacityKg),
            })}
          </p>
        )}
        {capacity.overVolume && sheet.vehicle?.capacityLiters && (
          <p role="alert" className="mt-1 font-medium text-red-600">
            {interpolate(r.overVolume, {
              capacity: format.number(sheet.vehicle.capacityLiters),
            })}
          </p>
        )}
      </section>

      <section className="mt-6">
        <h2 className="text-lg font-medium">{r.stops}</h2>
        {sheet.stops.length === 0 ? (
          <p className="mt-2 text-sm opacity-70">{r.noStops}</p>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <tbody>
                {sheet.stops.map((stop, index) => (
                  <tr
                    key={stop.id}
                    className="border-b border-current/10 align-top"
                  >
                    <td className="py-2 pr-3 font-semibold">{stop.position}</td>
                    <td className="py-2 pr-3">
                      <Link
                        href={`/admin/orders/${stop.sale.number}`}
                        className="font-medium hover:underline"
                      >
                        #{stop.sale.number}
                      </Link>{" "}
                      · {stop.sale.address.customer.tradeName}
                      <span className="block text-xs opacity-70">
                        {stop.sale.address.address},{" "}
                        {stop.sale.address.city.name}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-right whitespace-nowrap">
                      {interpolate(t.adminOrders.kg, {
                        value: format.number(stop.load.weight),
                      })}
                    </td>
                    <td className="py-2 pr-3 text-right whitespace-nowrap">
                      {format.money(stop.collect.total)}
                    </td>
                    {!draft && (
                      <td className="py-2 pr-3 whitespace-nowrap">
                        {/* Lo cargado en la parada, o cargarla (el admin también puede). */}
                        <Link
                          href={`/delivery/${sheet.number}/${stop.position}`}
                          className={`hover:underline ${
                            stop.status === "NOT_DELIVERED"
                              ? "text-red-600"
                              : ""
                          }`}
                        >
                          {t.delivery.statuses[stop.status]}
                        </Link>
                      </td>
                    )}
                    {draft && (
                      <td className="py-2 text-right whitespace-nowrap">
                        <div className="flex justify-end gap-3">
                          {index > 0 && (
                            <SheetActionButton
                              action={moveStopAction.bind(
                                null,
                                sheet.id,
                                stop.id,
                                -1,
                              )}
                              label={`↑ ${r.moveUp}`}
                              variant="link"
                              compact
                            />
                          )}
                          {index < sheet.stops.length - 1 && (
                            <SheetActionButton
                              action={moveStopAction.bind(
                                null,
                                sheet.id,
                                stop.id,
                                1,
                              )}
                              label={`↓ ${r.moveDown}`}
                              variant="link"
                              compact
                            />
                          )}
                          <SheetActionButton
                            action={removeStop.bind(null, sheet.id, stop.id)}
                            label={r.remove}
                            variant="danger"
                            compact
                          />
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {draft && options && (
        <div className="mt-8 grid gap-8 md:grid-cols-2">
          <section>
            <h2 className="mb-3 text-lg font-medium">{r.addStops}</h2>
            <AddStopsForm
              sheetId={sheet.id}
              candidates={candidates.map((sale) => ({
                id: sale.id,
                number: sale.number,
                customer: sale.address.customer.tradeName,
                address: sale.address.name,
                city: sale.address.city.name,
                total: format.money(sale.total),
              }))}
              t={r}
            />
          </section>
          <section>
            <h2 className="mb-3 text-lg font-medium">{r.edit}</h2>
            <RouteSheetForm
              action={updateRouteSheet.bind(null, sheet.id)}
              defaultValues={{
                date: day,
                driverId: sheet.driver.id,
                vehicleId: sheet.vehicle?.id ?? "",
                notes: sheet.notes ?? "",
              }}
              options={options}
              submitLabel={r.save}
              t={r}
              common={t.common}
            />
          </section>
        </div>
      )}
    </>
  );
}
