import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { buttonClass } from "@/components/ui/button";
import { interpolate } from "@/i18n/config";
import { formatters } from "@/i18n/format";
import { getLocale, getT } from "@/i18n/server";
import { getUserWithPermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { isCuid } from "@/lib/ids";
import { fromMilli, toMilli } from "@/lib/quantity";
import { MOVEMENTS_PAGE_SIZE, parsePage } from "@/lib/stock-filters";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.stock.movements };
}

export default async function ProductStockPage({
  params,
  searchParams,
}: PageProps<"/[lang]/admin/stock/[productId]">) {
  const t = await getT();

  return (
    <main className="mx-auto w-full max-w-5xl p-8">
      {/* params y la DB son de request: va en Suspense. */}
      <Suspense
        fallback={<p className="text-sm opacity-70">{t.common.loading}</p>}
      >
        <ProductStock params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function ProductStock({
  params,
  searchParams,
}: {
  params: Promise<{ productId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await getUserWithPermission("stock:manage");
  const { productId } = await params;
  if (!isCuid(productId)) notFound();

  const product = await db.product.findFirst({
    where: { id: productId, deletedAt: null },
    select: { id: true, name: true, sku: true, isActive: true },
  });
  if (!product) notFound();

  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const format = formatters(locale);
  const page = parsePage(await searchParams);

  const [stocks, total, movements] = await Promise.all([
    db.productStock.findMany({
      where: { productId },
      include: { warehouse: { select: { name: true, isActive: true } } },
      orderBy: { warehouse: { name: "asc" } },
    }),
    db.stockMovement.count({ where: { productId } }),
    db.stockMovement.findMany({
      where: { productId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * MOVEMENTS_PAGE_SIZE,
      take: MOVEMENTS_PAGE_SIZE,
      include: {
        warehouse: { select: { name: true } },
        createdBy: {
          select: { person: { select: { name: true, surname: true } } },
        },
      },
    }),
  ]);
  const totalStock = fromMilli(
    stocks.reduce((sum, s) => sum + toMilli(s.quantity), BigInt(0)),
  );
  const pages = Math.max(1, Math.ceil(total / MOVEMENTS_PAGE_SIZE));
  const pageLink = (target: number) =>
    `/admin/stock/${productId}${target > 1 ? `?page=${target}` : ""}`;
  const negative = (value: { toString(): string }) =>
    toMilli(value) < BigInt(0) ? "text-red-600" : "";

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{product.name}</h1>
          <p className="font-mono text-sm opacity-70">
            {product.sku}
            {!product.isActive && ` · ${t.stock.paused}`}
          </p>
        </div>
        <Link
          href={`/admin/stock/new?product=${product.id}`}
          className={buttonClass()}
        >
          {t.stock.newMovement}
        </Link>
      </div>

      <h2 className="mt-8 text-lg font-medium">{t.stock.balances}</h2>
      <table className="mt-3 w-full max-w-md text-left text-sm">
        <tbody>
          {stocks.map((stock) => (
            <tr key={stock.warehouseId} className="border-b border-current/10">
              <td className="py-2 pr-3">
                {stock.warehouse.name}
                {!stock.warehouse.isActive && (
                  <span className="opacity-60"> ({t.warehouses.inactive})</span>
                )}
              </td>
              <td
                className={`py-2 text-right font-mono ${negative(stock.quantity)}`}
              >
                {format.number(stock.quantity)}
              </td>
            </tr>
          ))}
          <tr className="font-semibold">
            <td className="py-2 pr-3">{t.stock.total}</td>
            <td className={`py-2 text-right font-mono ${negative(totalStock)}`}>
              {format.number(totalStock)}
            </td>
          </tr>
        </tbody>
      </table>

      <h2 className="mt-8 text-lg font-medium">{t.stock.movements}</h2>
      {movements.length === 0 ? (
        <p className="mt-3 text-sm opacity-70">{t.stock.noMovements}</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-current/20">
              <tr>
                <th className="py-2 pr-3 font-medium">{t.stock.date}</th>
                <th className="py-2 pr-3 font-medium">{t.stock.warehouse}</th>
                <th className="py-2 pr-3 font-medium">{t.stock.type}</th>
                <th className="py-2 pr-3 text-right font-medium">
                  {t.stock.quantity}
                </th>
                <th className="py-2 pr-3 text-right font-medium">
                  {t.stock.balanceAfter}
                </th>
                <th className="py-2 pr-3 font-medium">{t.stock.user}</th>
                <th className="py-2 font-medium">{t.stock.comment}</th>
              </tr>
            </thead>
            <tbody>
              {movements.map((movement) => (
                <tr
                  key={movement.id}
                  className="border-b border-current/10 align-top"
                >
                  <td className="py-2 pr-3 whitespace-nowrap">
                    {format.dateTime(movement.createdAt)}
                  </td>
                  <td className="py-2 pr-3">{movement.warehouse.name}</td>
                  <td className="py-2 pr-3">{t.stock.types[movement.type]}</td>
                  <td
                    className={`py-2 pr-3 text-right font-mono whitespace-nowrap ${negative(movement.quantity)}`}
                  >
                    {toMilli(movement.quantity) > BigInt(0) ? "+" : ""}
                    {format.number(movement.quantity)}
                  </td>
                  <td
                    className={`py-2 pr-3 text-right font-mono ${negative(movement.balanceAfter)}`}
                  >
                    {format.number(movement.balanceAfter)}
                  </td>
                  <td className="py-2 pr-3">
                    {movement.createdBy
                      ? `${movement.createdBy.person.name} ${movement.createdBy.person.surname}`
                      : "—"}
                  </td>
                  <td className="py-2">{movement.comment ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <nav className="mt-6 flex items-center justify-between gap-4 text-sm">
        <span className="opacity-70">
          {interpolate(t.stock.page, { page, pages })}
        </span>
        <div className="flex gap-3">
          {page > 1 && (
            <Link
              href={pageLink(page - 1)}
              className={buttonClass("secondary")}
            >
              {t.stock.previous}
            </Link>
          )}
          {page < pages && (
            <Link
              href={pageLink(page + 1)}
              className={buttonClass("secondary")}
            >
              {t.stock.next}
            </Link>
          )}
        </div>
      </nav>
    </>
  );
}
