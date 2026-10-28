import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { OrderDetail, OrderItems } from "@/components/orders/order-items";
import { interpolate } from "@/i18n/config";
import { formatters } from "@/i18n/format";
import { getLocale, getT } from "@/i18n/server";
import { getUserWithPermission } from "@/lib/auth";
import { parseSaleNumber } from "@/lib/checkout";
import { db } from "@/lib/db";
import { OrderActions } from "./order-actions";

export async function generateMetadata({
  params,
}: PageProps<"/[lang]/orders/[number]">): Promise<Metadata> {
  const t = await getT();
  return {
    title: interpolate(t.orders.detailTitle, { number: (await params).number }),
  };
}

export default async function OrderPage({
  params,
  searchParams,
}: PageProps<"/[lang]/orders/[number]">) {
  const t = await getT();

  return (
    <main className="mx-auto w-full max-w-4xl p-4 sm:p-8">
      <Link href="/orders" className="text-sm hover:underline">
        ← {t.orders.title}
      </Link>
      {/* params y la query a la DB son de request: van en Suspense. */}
      <Suspense
        fallback={<p className="mt-6 text-sm opacity-70">{t.common.loading}</p>}
      >
        <Order params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Order({
  params,
  searchParams,
}: {
  params: Promise<{ number: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getUserWithPermission("sales:create");
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const format = formatters(locale);

  const number = parseSaleNumber((await params).number);
  if (number === null) notFound();
  const created = (await searchParams).created === "1";

  // Un pedido de otra empresa se ve igual que uno que no existe.
  const sale = await db.sale.findFirst({
    where: { number, address: { customerId: user.customerId ?? "" } },
    include: {
      address: { include: { city: { select: { name: true } } } },
      user: { select: { person: { select: { name: true, surname: true } } } },
      items: {
        include: {
          product: {
            select: {
              name: true,
              sku: true,
              measurementUnit: { select: { name: true } },
            },
          },
        },
      },
    },
  });
  if (!sale) notFound();

  return (
    <>
      {created && (
        <p
          role="status"
          className="mt-4 rounded border border-green-700/40 bg-green-700/10 p-3 text-sm"
        >
          {t.orders.created}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold">
          {interpolate(t.orders.detailTitle, { number: sale.number })}
        </h1>
        <span className="rounded border border-current/20 px-2 py-0.5 text-sm">
          {t.orders.states[sale.state]}
        </span>
      </div>

      <dl className="mt-4 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
        <OrderDetail label={t.orders.date}>
          {format.dateTime(sale.createdAt)}
        </OrderDetail>
        <OrderDetail label={t.orders.orderedBy}>
          {sale.user.person.name} {sale.user.person.surname}
        </OrderDetail>
        <OrderDetail label={t.orders.address}>
          {sale.address.name}
          <span className="block opacity-70">
            {sale.address.address}, {sale.address.city.name}
          </span>
        </OrderDetail>
        <OrderDetail label={t.orders.payment}>
          {t.orders.paymentMethods[sale.paymentMethod]} ·{" "}
          {t.orders.paymentStates[sale.paymentState]}
        </OrderDetail>
        {sale.notes && (
          <OrderDetail label={t.orders.notes}>
            <span className="whitespace-pre-line">{sale.notes}</span>
          </OrderDetail>
        )}
      </dl>

      {sale.state === "PENDING" && (
        <OrderActions
          saleId={sale.id}
          canEdit={sale.customerCanEdit && !sale.editingPersonId}
          editingByMe={sale.editingPersonId === user.personId}
          t={t.orders}
        />
      )}

      <OrderItems
        items={sale.items}
        subTotal={sale.subTotal}
        tax={sale.tax}
        total={sale.total}
        locale={locale}
        format={format}
        t={t.cart}
      />
    </>
  );
}
