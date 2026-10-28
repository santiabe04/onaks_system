import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { SaleState } from "@/generated/prisma/enums";
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
import { allowedTransitions, isStepBack, stockEffect } from "@/lib/sale-state";
import { StateChangeForm } from "./state-change-form";

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

// Detalle + cambio de estado (con descuento/devolución de stock) e historial.
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

  // Para descontar stock: solo depósitos activos.
  const warehouses = await db.warehouse.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
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

      <section className="mt-8 grid gap-8 md:grid-cols-2 print:hidden">
        <div>
          <h2 className="mb-3 text-lg font-medium">
            {t.adminOrders.stateChange.title}
          </h2>
          <StateChangeForm
            saleId={sale.id}
            current={sale.state}
            targets={allowedTransitions(sale.state).map((state) => ({
              state,
              back: isStepBack(sale.state, state),
              effect: stockEffect(sale.state, state),
            }))}
            items={sale.items.map((item) => ({
              productId: item.productId,
              name: item.product.name,
              quantity: `${format.number(item.quantity)} ${item.product.measurementUnit.name}`,
            }))}
            warehouses={warehouses}
            t={t.adminOrders.stateChange}
            states={t.orders.states}
          />
        </div>
        <div>
          <h2 className="mb-3 text-lg font-medium">
            {t.adminOrders.history.title}
          </h2>
          <History saleId={sale.id} />
        </div>
      </section>
    </>
  );
}

/** Confirmación y cambios de estado del pedido, desde la auditoría. */
async function History({ saleId }: { saleId: string }) {
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const format = formatters(locale);
  const logs = await db.auditLog.findMany({
    where: { entityType: "SALE", entityId: saleId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      action: true,
      createdAt: true,
      before: true,
      after: true,
      metadata: true,
      actor: { select: { person: { select: { name: true, surname: true } } } },
    },
  });
  const stateOf = (value: unknown) =>
    (value as { state?: SaleState } | null)?.state;
  const commentOf = (value: unknown) =>
    (value as { comment?: string | null } | null)?.comment;

  return (
    <ol className="flex flex-col gap-3 border-l border-current/20 pl-4 text-sm">
      {logs.map((log) => {
        const from = stateOf(log.before);
        const to = stateOf(log.after);
        const comment = commentOf(log.metadata);
        const actor = log.actor?.person;
        return (
          <li key={log.id}>
            <p className="font-medium">
              {log.action === "CREATE"
                ? t.adminOrders.history.created
                : from && to
                  ? interpolate(t.adminOrders.history.changed, {
                      from: t.orders.states[from],
                      to: t.orders.states[to],
                    })
                  : log.action}
            </p>
            <p className="text-xs opacity-70">
              {format.dateTime(log.createdAt)}
              {actor &&
                ` · ${interpolate(t.adminOrders.history.by, {
                  name: `${actor.name} ${actor.surname}`,
                })}`}
            </p>
            {comment && <p className="mt-1 whitespace-pre-line">{comment}</p>}
          </li>
        );
      })}
    </ol>
  );
}
