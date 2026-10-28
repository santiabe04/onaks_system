import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { buttonClass } from "@/components/ui/button";
import { interpolate } from "@/i18n/config";
import { formatters } from "@/i18n/format";
import { getLocale, getT } from "@/i18n/server";
import { getUserWithPermission } from "@/lib/auth";
import { db } from "@/lib/db";

const PATH = "/orders";
const PAGE_SIZE = 20;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.orders.title };
}

export default async function OrdersPage({
  searchParams,
}: PageProps<"/[lang]/orders">) {
  const t = await getT();

  return (
    <main className="mx-auto w-full max-w-5xl p-4 sm:p-8">
      <h1 className="text-2xl font-semibold">{t.orders.title}</h1>
      {/* La página viene de la URL y los pedidos de la DB: van en Suspense. */}
      <Suspense
        fallback={<p className="mt-6 text-sm opacity-70">{t.common.loading}</p>}
      >
        <Orders searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Orders({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Quien compra ve los pedidos de toda su empresa, no solo los propios.
  const user = await getUserWithPermission("sales:create");
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const format = formatters(locale);

  const raw = (await searchParams).page;
  const requested = Number.parseInt(
    (Array.isArray(raw) ? raw[0] : raw) ?? "",
    10,
  );
  const page = Number.isInteger(requested) && requested >= 1 ? requested : 1;

  const where = { address: { customerId: user.customerId ?? "" } };
  const [total, sales] = await Promise.all([
    db.sale.count({ where }),
    db.sale.findMany({
      where,
      orderBy: { number: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        number: true,
        createdAt: true,
        state: true,
        total: true,
        address: { select: { name: true } },
        user: { select: { person: { select: { name: true, surname: true } } } },
      },
    }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (total === 0) {
    return (
      <div className="mt-6 flex flex-col items-start gap-4">
        <p className="text-sm opacity-70">{t.orders.empty}</p>
        <Link href="/" className={buttonClass()}>
          {t.cart.goToCatalog}
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="mt-6 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-current/20">
            <tr>
              <th className="py-2 pr-3 font-medium">{t.orders.number}</th>
              <th className="py-2 pr-3 font-medium">{t.orders.date}</th>
              <th className="py-2 pr-3 font-medium">{t.orders.orderedBy}</th>
              <th className="py-2 pr-3 font-medium">{t.orders.address}</th>
              <th className="py-2 pr-3 font-medium">{t.orders.state}</th>
              <th className="py-2 text-right font-medium">{t.cart.total}</th>
            </tr>
          </thead>
          <tbody>
            {sales.map((sale) => (
              <tr key={sale.number} className="border-b border-current/10">
                <td className="py-2 pr-3">
                  <Link
                    href={`${PATH}/${sale.number}`}
                    className="font-medium hover:underline"
                  >
                    #{sale.number}
                  </Link>
                </td>
                <td className="py-2 pr-3 whitespace-nowrap">
                  {format.dateTime(sale.createdAt)}
                </td>
                <td className="py-2 pr-3">
                  {sale.user.person.name} {sale.user.person.surname}
                </td>
                <td className="py-2 pr-3">{sale.address.name}</td>
                <td className="py-2 pr-3">{t.orders.states[sale.state]}</td>
                <td className="py-2 text-right whitespace-nowrap">
                  {format.money(sale.total)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <nav className="mt-6 flex items-center justify-between gap-4 text-sm">
        <span className="opacity-70">
          {interpolate(t.orders.count, { count: format.number(total) })} ·{" "}
          {interpolate(t.catalog.page, { page, pages })}
        </span>
        <div className="flex gap-3">
          {page > 1 && (
            <Link
              href={page === 2 ? PATH : `${PATH}?page=${page - 1}`}
              className={buttonClass("secondary")}
            >
              {t.catalog.previous}
            </Link>
          )}
          {page < pages && (
            <Link
              href={`${PATH}?page=${page + 1}`}
              className={buttonClass("secondary")}
            >
              {t.catalog.next}
            </Link>
          )}
        </div>
      </nav>
    </>
  );
}
