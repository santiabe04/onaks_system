import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ScanForm } from "@/components/stock/count-forms";
import { buttonClass } from "@/components/ui/button";
import { interpolate } from "@/i18n/config";
import { formatters } from "@/i18n/format";
import { getLocale, getT } from "@/i18n/server";
import { getUserWithPermission } from "@/lib/auth";
import { parseSaleNumber } from "@/lib/checkout";
import { can } from "@/lib/permissions";
import { toMilli } from "@/lib/quantity";
import { getStockCount } from "@/lib/stock-count-queries";
import { removeCountEntry } from "../actions";

const PATH = "/admin/stock/counts";

export async function generateMetadata({
  params,
}: PageProps<"/[lang]/admin/stock/counts/[number]">): Promise<Metadata> {
  const t = await getT();
  return {
    title: interpolate(t.stockCount.numbered, {
      number: (await params).number,
    }),
  };
}

export default async function StockCountPage({
  params,
}: PageProps<"/[lang]/admin/stock/counts/[number]">) {
  const t = await getT();
  return (
    <main className="mx-auto w-full max-w-3xl p-4 sm:p-8">
      <Link href={PATH} className="text-sm hover:underline">
        ← {t.stockCount.title}
      </Link>
      {/* params y el conteo son de request: van en Suspense. */}
      <Suspense
        fallback={<p className="mt-6 text-sm opacity-70">{t.common.loading}</p>}
      >
        <Count params={params} />
      </Suspense>
    </main>
  );
}

async function Count({ params }: { params: Promise<{ number: string }> }) {
  const user = await getUserWithPermission("stock:count");
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const format = formatters(locale);
  const s = t.stockCount;

  const number = parseSaleNumber((await params).number);
  if (number === null) notFound();
  const count = await getStockCount(number);
  if (!count) notFound();
  const open = count.state === "OPEN";
  const canReview = can(user.role, "stock:manage");

  return (
    <>
      <h1 className="mt-2 text-2xl font-semibold">
        {interpolate(s.numbered, { number: count.number })}
      </h1>
      <p className="mt-1 text-sm opacity-70">
        {count.warehouseName} · {s.states[count.state]} ·{" "}
        {format.dateTime(count.createdAt)}
      </p>
      {count.notes && <p className="mt-1 text-sm">{count.notes}</p>}

      {open ? (
        <>
          <p className="mt-4 text-sm opacity-70">{s.blindHint}</p>
          <ScanForm countId={count.id} t={s} />
        </>
      ) : (
        <p className="mt-4 text-sm opacity-70">
          {count.state === "APPROVED" && count.approvedAt
            ? interpolate(s.approvedOn, {
                date: format.dateTime(count.approvedAt),
              })
            : s.canceledHint}
        </p>
      )}

      <h2 className="mt-8 text-lg font-medium">
        {interpolate(s.counted, { count: count.items.length })}
      </h2>
      {count.items.length === 0 ? (
        <p className="mt-2 text-sm opacity-70">{s.nothingCounted}</p>
      ) : (
        <div className="overflow-x-auto print:overflow-visible">
          <table className="mt-2 w-full text-left text-sm">
            <thead className="border-b border-current/20">
              <tr>
                <th className="py-2 pr-3 font-medium">{s.columns.product}</th>
                <th className="py-2 pr-3 font-medium">{s.columns.counted}</th>
                {!open && (
                  <th className="py-2 pr-3 font-medium">
                    {s.columns.difference}
                  </th>
                )}
                {open && <th />}
              </tr>
            </thead>
            <tbody>
              {count.items.map((item) => (
                <tr key={item.productId} className="border-b border-current/10">
                  <td className="py-2 pr-3">
                    {item.name}
                    <span className="block font-mono text-xs opacity-70">
                      {item.sku}
                    </span>
                  </td>
                  <td className="py-2 pr-3 whitespace-nowrap">
                    {format.number(item.counted)} {item.unit}
                  </td>
                  {!open && (
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {item.applied === null
                        ? "—"
                        : toMilli(item.applied) > BigInt(0)
                          ? `+${format.number(item.applied)}`
                          : format.number(item.applied)}
                    </td>
                  )}
                  {open && (
                    <td className="py-2 text-right">
                      <form
                        action={removeCountEntry.bind(
                          null,
                          count.id,
                          item.productId,
                        )}
                      >
                        <button type="submit" className="text-xs underline">
                          {s.remove}
                        </button>
                      </form>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {open && canReview && (
        <p className="mt-6">
          <Link
            href={`${PATH}/${count.number}/review`}
            className={buttonClass()}
          >
            {s.review}
          </Link>
        </p>
      )}
    </>
  );
}
