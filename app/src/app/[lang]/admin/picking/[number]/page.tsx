import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ConfirmPickingForm } from "@/components/picking/picking-forms";
import { PickingRoute } from "@/components/picking/picking-route";
import { SheetActionButton } from "@/components/routes/route-forms";
import { buttonClass } from "@/components/ui/button";
import { interpolate } from "@/i18n/config";
import { formatters } from "@/i18n/format";
import { getLocale, getT } from "@/i18n/server";
import { getUserWithPermission } from "@/lib/auth";
import { parseSaleNumber } from "@/lib/checkout";
import { getPickingList } from "@/lib/picking-queries";
import { toMilli } from "@/lib/quantity";
import { cancelPickingList, removePickingSale } from "../actions";

const PATH = "/admin/picking";

export async function generateMetadata({
  params,
}: PageProps<"/[lang]/admin/picking/[number]">): Promise<Metadata> {
  const t = await getT();
  return {
    title: interpolate(t.picking.detailTitle, {
      number: (await params).number,
    }),
  };
}

export default async function PickingListPage({
  params,
}: PageProps<"/[lang]/admin/picking/[number]">) {
  const t = await getT();
  return (
    <main className="mx-auto w-full max-w-5xl p-8">
      <Link href={PATH} className="text-sm hover:underline">
        ← {t.picking.title}
      </Link>
      {/* params y la lista son de request: van en Suspense. */}
      <Suspense
        fallback={<p className="mt-6 text-sm opacity-70">{t.common.loading}</p>}
      >
        <PickingList params={params} />
      </Suspense>
    </main>
  );
}

async function PickingList({
  params,
}: {
  params: Promise<{ number: string }>;
}) {
  await getUserWithPermission("sales:manage");
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const format = formatters(locale);
  const p = t.picking;

  const number = parseSaleNumber((await params).number);
  if (number === null) notFound();
  const found = await getPickingList(number);
  if (!found) notFound();
  const { list, lines } = found;
  const open = list.state === "OPEN";
  const fullName = (user: typeof list.createdBy) =>
    user ? `${user.person.name} ${user.person.surname}` : "—";

  // Por pedido, en el orden de la lista.
  const orders = [...new Set(lines.map((line) => line.saleId))].map(
    (saleId) => {
      const own = lines.filter((line) => line.saleId === saleId);
      return {
        saleId,
        number: own[0].saleNumber,
        customer: own[0].customer,
        lines: own,
      };
    },
  );

  return (
    <>
      <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold">
          {interpolate(p.detailTitle, { number: list.number })}
        </h1>
        <span className="rounded border border-current/20 px-2 py-0.5 text-sm">
          {p.states[list.state]}
        </span>
      </div>
      <p className="mt-1 text-sm">
        {list.warehouse.name} ·{" "}
        {orders.length === 1
          ? p.oneOrder
          : interpolate(p.ordersCount, { count: orders.length })}
      </p>
      {list.notes && <p className="mt-1 text-sm">{list.notes}</p>}
      <p className="mt-1 text-xs opacity-70">
        {interpolate(p.createdBy, {
          user: fullName(list.createdBy),
          date: format.dateTime(list.createdAt),
        })}
      </p>
      {list.confirmedAt && (
        <p className="text-xs opacity-70">
          {interpolate(p.confirmedBy, {
            preparer: list.preparer ?? fullName(list.confirmedBy),
            user: fullName(list.confirmedBy),
            date: format.dateTime(list.confirmedAt),
          })}
        </p>
      )}
      {list.canceledAt && (
        <p className="text-sm text-red-600">
          {interpolate(p.canceledAt, {
            date: format.dateTime(list.canceledAt),
          })}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-start gap-3">
        <Link
          href={`${PATH}/${list.number}/print`}
          className={buttonClass("secondary")}
        >
          {p.print}
        </Link>
        {open && (
          <SheetActionButton
            action={cancelPickingList.bind(null, list.id)}
            label={p.cancel}
            confirm={p.confirmCancel}
            variant="danger"
          />
        )}
      </div>

      <h2 className="mt-6 mb-2 text-lg font-medium">{p.route}</h2>
      <PickingRoute lines={lines} t={p} format={format} />

      <h2 className="mt-8 mb-2 text-lg font-medium">{p.byOrder}</h2>
      <div className="flex flex-col gap-3">
        {orders.map((order) => (
          <section
            key={order.saleId}
            className="rounded border border-current/20 p-3 text-sm"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p>
                <Link
                  href={`/admin/orders/${order.number}`}
                  className="font-medium hover:underline"
                >
                  #{order.number}
                </Link>{" "}
                · {order.customer}
              </p>
              {open && orders.length > 1 && (
                <SheetActionButton
                  action={removePickingSale.bind(null, list.id, order.saleId)}
                  label={p.removeOrder}
                  confirm={interpolate(p.confirmRemove, {
                    number: order.number,
                  })}
                  variant="danger"
                  compact
                />
              )}
            </div>
            <ul className="mt-1">
              {order.lines.map((line) => {
                const short =
                  line.picked !== null &&
                  toMilli(line.picked) < toMilli(line.quantity);
                return (
                  <li key={line.productId}>
                    {format.number(line.quantity)} {line.unit} · {line.name}
                    {short && line.picked && (
                      <span className="ml-2 text-amber-700 dark:text-amber-400">
                        {interpolate(p.shortage, {
                          picked: format.number(line.picked),
                          quantity: format.number(line.quantity),
                          reason:
                            p.reasons[
                              line.shortageReason as keyof typeof p.reasons
                            ],
                        })}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      {open && (
        <section className="mt-8">
          <h2 className="mb-2 text-lg font-medium">{p.confirmTitle}</h2>
          <ConfirmPickingForm
            listId={list.id}
            lines={lines.map((line) => ({
              saleId: line.saleId,
              saleNumber: line.saleNumber,
              customer: line.customer,
              productId: line.productId,
              name: line.name,
              unit: line.unit,
              allowsDecimals: line.allowsDecimals,
              quantity: line.quantity.toString(),
              quantityInput: format.input(line.quantity),
              quantityLabel: format.number(line.quantity),
            }))}
            t={p}
          />
        </section>
      )}
    </>
  );
}
