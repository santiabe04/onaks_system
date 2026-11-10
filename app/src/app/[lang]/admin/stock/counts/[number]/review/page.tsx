import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { ReviewActions } from "@/components/stock/count-forms";
import { interpolate } from "@/i18n/config";
import { formatters } from "@/i18n/format";
import { getLocale, getT } from "@/i18n/server";
import { getUserWithPermission } from "@/lib/auth";
import { parseSaleNumber } from "@/lib/checkout";
import { toMilli } from "@/lib/quantity";
import { countDifference, summarizeCount } from "@/lib/stock-count";
import { getStockCount } from "@/lib/stock-count-queries";
import { removeCountEntry } from "../../actions";

const PATH = "/admin/stock/counts";

export async function generateMetadata({
  params,
}: PageProps<"/[lang]/admin/stock/counts/[number]/review">): Promise<Metadata> {
  const t = await getT();
  return {
    title: interpolate(t.stockCount.reviewTitle, {
      number: (await params).number,
    }),
  };
}

export default async function ReviewPage({
  params,
}: PageProps<"/[lang]/admin/stock/counts/[number]/review">) {
  const t = await getT();
  return (
    <main className="mx-auto w-full max-w-4xl p-4 sm:p-8">
      <Link href={PATH} className="text-sm hover:underline">
        ← {t.stockCount.title}
      </Link>
      {/* params y el conteo son de request: van en Suspense. */}
      <Suspense
        fallback={<p className="mt-6 text-sm opacity-70">{t.common.loading}</p>}
      >
        <Review params={params} />
      </Suspense>
    </main>
  );
}

async function Review({ params }: { params: Promise<{ number: string }> }) {
  await getUserWithPermission("stock:manage");
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const format = formatters(locale);
  const s = t.stockCount;

  const number = parseSaleNumber((await params).number);
  if (number === null) notFound();
  const count = await getStockCount(number);
  if (!count) notFound();
  // Ya aprobado o descartado: queda el resultado en el detalle.
  if (count.state !== "OPEN") redirect(`${PATH}/${count.number}`);

  const lines = count.items.map((item) => ({
    ...item,
    difference: countDifference(item.counted, item.expected),
  }));
  const summary = summarizeCount(lines);
  // Primero lo que tiene diferencia, que es lo que hay que revisar.
  const sorted = [...lines].sort(
    (a, b) =>
      Number(toMilli(b.difference) !== BigInt(0)) -
      Number(toMilli(a.difference) !== BigInt(0)),
  );

  return (
    <>
      <h1 className="mt-2 text-2xl font-semibold">
        {interpolate(s.reviewTitle, { number: count.number })}
      </h1>
      <p className="mt-1 text-sm opacity-70">{count.warehouseName}</p>
      <p className="mt-4 text-sm">
        {interpolate(s.summary, {
          total: summary.total,
          matching: summary.matching,
          surplus: summary.surplus,
          missing: summary.missing,
        })}
      </p>
      <p className="mt-2 max-w-2xl text-sm opacity-70">{s.reviewHint}</p>

      {lines.length === 0 ? (
        <p className="mt-6 text-sm opacity-70">{s.nothingCounted}</p>
      ) : (
        <div className="overflow-x-auto print:overflow-visible">
          <table className="mt-4 w-full text-left text-sm">
            <thead className="border-b border-current/20">
              <tr>
                <th className="py-2 pr-3 font-medium">{s.columns.product}</th>
                <th className="py-2 pr-3 font-medium">{s.columns.expected}</th>
                <th className="py-2 pr-3 font-medium">{s.columns.counted}</th>
                <th className="py-2 pr-3 font-medium">
                  {s.columns.difference}
                </th>
                <th />
              </tr>
            </thead>
            <tbody>
              {sorted.map((line) => {
                const diff = toMilli(line.difference);
                return (
                  <tr
                    key={line.productId}
                    className="border-b border-current/10"
                  >
                    <td className="py-2 pr-3">
                      {line.name}
                      <span className="block font-mono text-xs opacity-70">
                        {line.sku}
                      </span>
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {format.number(line.expected)} {line.unit}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {format.number(line.counted)} {line.unit}
                    </td>
                    <td
                      className={`py-2 pr-3 whitespace-nowrap ${
                        diff === BigInt(0)
                          ? "opacity-60"
                          : diff > BigInt(0)
                            ? "text-emerald-700 dark:text-emerald-400"
                            : "text-red-600"
                      }`}
                    >
                      {diff > BigInt(0) ? "+" : ""}
                      {format.number(line.difference)}
                    </td>
                    <td className="py-2 text-right">
                      <form
                        action={removeCountEntry.bind(
                          null,
                          count.id,
                          line.productId,
                        )}
                      >
                        <button type="submit" className="text-xs underline">
                          {s.remove}
                        </button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ReviewActions
        countId={count.id}
        hasDifferences={summary.surplus + summary.missing > 0}
        t={s}
      />
      <p className="mt-4 text-sm">
        <Link href={`${PATH}/${count.number}`} className="hover:underline">
          {s.backToCount}
        </Link>
      </p>
    </>
  );
}
