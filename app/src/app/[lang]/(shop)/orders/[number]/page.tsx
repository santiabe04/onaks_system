import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { interpolate } from "@/i18n/config";
import { formatters } from "@/i18n/format";
import { getLocale, getT } from "@/i18n/server";
import { getUserWithPermission } from "@/lib/auth";
import { cartTotals, lineTotals } from "@/lib/cart";
import { parseSaleNumber } from "@/lib/checkout";
import { db } from "@/lib/db";
import { finalPrice } from "@/lib/price";

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

  // Todo sale de la foto guardada al confirmar, no del producto actual.
  const items = [...sale.items].sort((a, b) =>
    a.product.name.localeCompare(b.product.name, locale),
  );
  const line = (item: (typeof items)[number]) => ({
    price: item.unitPrice,
    rate: item.unitTaxRate,
    quantity: item.quantity,
    weight: item.unitWeight,
  });
  const { weight } = cartTotals(items.map(line));

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
        <Detail label={t.orders.date}>{format.dateTime(sale.createdAt)}</Detail>
        <Detail label={t.orders.orderedBy}>
          {sale.user.person.name} {sale.user.person.surname}
        </Detail>
        <Detail label={t.orders.address}>
          {sale.address.name}
          <span className="block opacity-70">
            {sale.address.address}, {sale.address.city.name}
          </span>
        </Detail>
        <Detail label={t.orders.payment}>
          {t.orders.paymentMethods[sale.paymentMethod]} ·{" "}
          {t.orders.paymentStates[sale.paymentState]}
        </Detail>
        {sale.notes && (
          <Detail label={t.orders.notes}>
            <span className="whitespace-pre-line">{sale.notes}</span>
          </Detail>
        )}
      </dl>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-current/20">
            <tr>
              <th className="py-2 pr-3 font-medium">{t.cart.product}</th>
              <th className="py-2 pr-3 text-right font-medium">
                {t.cart.quantity}
              </th>
              <th className="py-2 pr-3 text-right font-medium">
                {t.cart.unitPrice}
              </th>
              <th className="py-2 text-right font-medium">
                {t.cart.lineTotal}
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr
                key={item.productId}
                className="border-b border-current/10 align-top"
              >
                <td className="py-2 pr-3">
                  {item.product.name}
                  <span className="block font-mono text-xs opacity-70">
                    {item.product.sku}
                  </span>
                </td>
                <td className="py-2 pr-3 text-right whitespace-nowrap">
                  {format.number(item.quantity)}{" "}
                  {item.product.measurementUnit.name}
                </td>
                <td className="py-2 pr-3 text-right whitespace-nowrap">
                  {format.money(finalPrice(item.unitPrice, item.unitTaxRate))}
                </td>
                <td className="py-2 text-right whitespace-nowrap">
                  {format.money(lineTotals(line(item)).total)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <dl className="mt-6 ml-auto flex w-full max-w-xs flex-col gap-1 text-sm">
        <div className="flex justify-between">
          <dt className="opacity-70">{t.cart.net}</dt>
          <dd>{format.money(sale.subTotal)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="opacity-70">{t.cart.tax}</dt>
          <dd>{format.money(sale.tax)}</dd>
        </div>
        <div className="flex justify-between border-t border-current/20 pt-1 text-lg font-semibold">
          <dt>{t.cart.total}</dt>
          <dd>{format.money(sale.total)}</dd>
        </div>
        <p className="mt-1 text-xs opacity-70">
          {interpolate(t.cart.weight, { weight: format.number(weight) })}
        </p>
      </dl>
    </>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="opacity-70">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
