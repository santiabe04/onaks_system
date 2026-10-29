import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { buttonClass } from "@/components/ui/button";
import type { PurchaseOrderState } from "@/generated/prisma/enums";
import { interpolate } from "@/i18n/config";
import { formatters } from "@/i18n/format";
import { getLocale, getT } from "@/i18n/server";
import { toMilli } from "@/lib/quantity";
import { getUserWithPermission } from "@/lib/auth";
import { db } from "@/lib/db";

const PATH = "/admin/purchases";
const OPEN: PurchaseOrderState[] = ["DRAFT", "SENT", "PARTIALLY_RECEIVED"];

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.purchases.title };
}

export default async function PurchasesPage({
  searchParams,
}: PageProps<"/[lang]/admin/purchases">) {
  const t = await getT();
  return (
    <main className="mx-auto w-full max-w-5xl p-4 sm:p-8">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{t.purchases.title}</h1>
        <Link href={`${PATH}/new`} className={buttonClass()}>
          {t.purchases.newButton}
        </Link>
      </div>
      {/* El filtro viene de la URL y las órdenes de la DB: van en Suspense. */}
      <Suspense
        fallback={<p className="mt-6 text-sm opacity-70">{t.common.loading}</p>}
      >
        <Purchases searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Purchases({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await getUserWithPermission("purchases:manage");
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const format = formatters(locale);
  const p = t.purchases;
  const showClosed = (await searchParams).closed === "1";

  const [orders, lowStock] = await Promise.all([
    db.purchaseOrder.findMany({
      where: showClosed ? {} : { state: { in: OPEN } },
      orderBy: { number: "desc" },
      take: 100,
      select: {
        number: true,
        createdAt: true,
        expectedDate: true,
        state: true,
        total: true,
        supplier: { select: { legalName: true, tradeName: true } },
      },
    }),
    // Para el aviso: productos con mínimo cargado y por debajo (total de depósitos).
    db.product
      .findMany({
        where: { minStock: { not: null }, deletedAt: null },
        select: {
          minStock: true,
          stocks: { select: { quantity: true } },
        },
      })
      .then(
        (products) =>
          products.filter(
            (product) =>
              product.stocks.reduce(
                (sum, stock) => sum + toMilli(stock.quantity),
                BigInt(0),
              ) < toMilli(product.minStock!),
          ).length,
      ),
  ]);
  const day = (date: Date) =>
    format.date(new Date(`${date.toISOString().slice(0, 10)}T12:00:00-03:00`));

  return (
    <>
      <div className="mt-4 flex flex-wrap gap-x-6 text-sm">
        {lowStock > 0 && (
          <Link
            href="/admin/stock?level=low"
            className="font-medium text-red-600 hover:underline"
          >
            {interpolate(p.lowStock, { count: lowStock })}
          </Link>
        )}
        <Link
          href={showClosed ? PATH : `${PATH}?closed=1`}
          className="hover:underline"
        >
          {showClosed ? p.showOpen : p.showClosed}
        </Link>
      </div>
      {orders.length === 0 ? (
        <p className="mt-6 text-sm opacity-70">{p.empty}</p>
      ) : (
        <div className="overflow-x-auto print:overflow-visible">
          <table className="mt-4 w-full text-left text-sm">
            <thead className="border-b border-current/20">
              <tr>
                <th className="py-2 pr-3 font-medium">{p.columns.number}</th>
                <th className="py-2 pr-3 font-medium">{p.supplier}</th>
                <th className="py-2 pr-3 font-medium">{p.columns.date}</th>
                <th className="py-2 pr-3 font-medium">{p.expected}</th>
                <th className="py-2 pr-3 font-medium">{p.columns.state}</th>
                <th className="py-2 text-right font-medium">
                  {p.columns.total}
                </th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.number} className="border-b border-current/10">
                  <td className="py-2 pr-3">
                    <Link
                      href={`${PATH}/${order.number}`}
                      className="font-medium hover:underline"
                    >
                      #{order.number}
                    </Link>
                  </td>
                  <td className="py-2 pr-3">
                    {order.supplier.tradeName ?? order.supplier.legalName}
                  </td>
                  <td className="py-2 pr-3 whitespace-nowrap">
                    {format.date(order.createdAt)}
                  </td>
                  <td className="py-2 pr-3 whitespace-nowrap">
                    {order.expectedDate ? day(order.expectedDate) : "—"}
                  </td>
                  <td className="py-2 pr-3">{p.states[order.state]}</td>
                  <td className="py-2 text-right whitespace-nowrap">
                    {format.money(order.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
