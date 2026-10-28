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
import { formatCuit } from "@/lib/cuit";
import { db } from "@/lib/db";
import { groupOrdersByZone } from "@/lib/orders-by-zone";

export async function generateMetadata({
  params,
}: PageProps<"/[lang]/admin/orders/[number]">): Promise<Metadata> {
  const t = await getT();
  return {
    title: interpolate(t.orders.detailTitle, { number: (await params).number }),
  };
}

export default async function AdminOrderPage({
  params,
}: PageProps<"/[lang]/admin/orders/[number]">) {
  const t = await getT();

  return (
    <main className="mx-auto w-full max-w-4xl p-8">
      <Link href="/admin/orders" className="text-sm hover:underline">
        {t.adminOrders.detail.back}
      </Link>
      {/* params y la query a la DB son de request: van en Suspense. */}
      <Suspense
        fallback={<p className="mt-6 text-sm opacity-70">{t.common.loading}</p>}
      >
        <Order params={params} />
      </Suspense>
    </main>
  );
}

// Solo lectura: los cambios de estado y de pago llegan con la gestión de pedidos.
async function Order({ params }: { params: Promise<{ number: string }> }) {
  await getUserWithPermission("sales:read-all");
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const format = formatters(locale);

  const number = parseSaleNumber((await params).number);
  if (number === null) notFound();

  const sale = await db.sale.findUnique({
    where: { number },
    include: {
      address: {
        include: {
          customer: {
            select: { id: true, tradeName: true, legalName: true, cuit: true },
          },
          city: { select: { name: true, state: { select: { name: true } } } },
        },
      },
      user: {
        select: {
          person: {
            select: { name: true, surname: true, mail: true, phone: true },
          },
        },
      },
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

  const { customer, city } = sale.address;
  const person = sale.user.person;
  // Mismo cálculo que en la pantalla por zona.
  const { totals } = groupOrdersByZone([
    {
      cityId: 0,
      cityName: city.name,
      stateName: city.state.name,
      paymentMethod: sale.paymentMethod,
      total: sale.total,
      items: sale.items,
    },
  ]);

  return (
    <>
      <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold">
          {interpolate(t.orders.detailTitle, { number: sale.number })}
        </h1>
        <span className="rounded border border-current/20 px-2 py-0.5 text-sm">
          {t.orders.states[sale.state]}
        </span>
      </div>

      <dl className="mt-4 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
        <OrderDetail label={t.orders.date}>
          {format.dateTime(sale.createdAt)}
        </OrderDetail>
        <OrderDetail label={t.adminOrders.detail.customer}>
          <Link
            href={`/admin/customers/${customer.id}`}
            className="hover:underline"
          >
            {customer.tradeName}
          </Link>
          <span className="block opacity-70">
            {customer.legalName} ·{" "}
            {interpolate(t.adminOrders.detail.cuit, {
              cuit: formatCuit(customer.cuit),
            })}
          </span>
        </OrderDetail>
        <OrderDetail label={t.adminOrders.detail.contact}>
          {person.name} {person.surname}
          <span className="block opacity-70">
            {[person.mail, person.phone].filter(Boolean).join(" · ")}
          </span>
        </OrderDetail>
        <OrderDetail label={t.orders.address}>
          {sale.address.name}
          <span className="block opacity-70">
            {[
              sale.address.address,
              sale.address.zipCode && `CP ${sale.address.zipCode}`,
            ]
              .filter(Boolean)
              .join(", ")}
          </span>
        </OrderDetail>
        <OrderDetail label={t.adminOrders.detail.zone}>
          {city.name}
          <span className="block opacity-70">{city.state.name}</span>
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

      <OrderItems
        items={sale.items}
        subTotal={sale.subTotal}
        tax={sale.tax}
        total={sale.total}
        locale={locale}
        format={format}
        t={t.cart}
      />
      <p className="mt-1 text-right text-xs opacity-70">
        {interpolate(t.adminOrders.detail.volume, {
          volume: format.number(totals.volume),
        })}
        {totals.missingVolume && ` · ${t.adminOrders.missingVolume}`}
      </p>
    </>
  );
}
