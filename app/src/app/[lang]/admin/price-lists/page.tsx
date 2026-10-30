import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { buttonClass } from "@/components/ui/button";
import { DeleteButton } from "@/components/ui/delete-button";
import { interpolate } from "@/i18n/config";
import { formatters } from "@/i18n/format";
import { getLocale, getT } from "@/i18n/server";
import { getUserWithPermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { deletePriceList } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.priceLists.title };
}

export default async function PriceListsPage() {
  const t = await getT();

  return (
    <main className="mx-auto w-full max-w-3xl p-4 sm:p-8">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{t.priceLists.title}</h1>
        <Link href="/admin/price-lists/new" className={buttonClass()}>
          {t.priceLists.newButton}
        </Link>
      </div>
      <p className="mt-2 text-sm opacity-70">{t.priceLists.hint}</p>

      {/* La lista sale de la DB en cada request: va en Suspense (cacheComponents). */}
      <Suspense
        fallback={<p className="mt-6 text-sm opacity-70">{t.common.loading}</p>}
      >
        <PriceListsTable />
      </Suspense>
    </main>
  );
}

async function PriceListsTable() {
  await getUserWithPermission("price-lists:manage");
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const format = formatters(locale);

  const priceLists = await db.priceList.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { customers: true, items: true } } },
  });

  if (priceLists.length === 0) {
    return <p className="mt-6 text-sm opacity-70">{t.priceLists.empty}</p>;
  }

  return (
    <div className="overflow-x-auto print:overflow-visible">
      <table className="mt-6 w-full text-left text-sm">
        <thead className="border-b border-current/20">
          <tr>
            <th className="py-2 pr-3 font-medium">{t.priceLists.name}</th>
            <th className="py-2 pr-3 text-right font-medium">
              {t.priceLists.adjustmentColumn}
            </th>
            <th className="py-2 pr-3 text-right font-medium">
              {t.priceLists.fixedPrices}
            </th>
            <th className="py-2 pr-3 text-right font-medium">
              {t.priceLists.customers}
            </th>
            <th className="py-2">
              <span className="sr-only">{t.common.actions}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {priceLists.map((list) => (
            <tr key={list.id} className="border-b border-current/10 align-top">
              <td className="py-2 pr-3">{list.name}</td>
              <td className="py-2 pr-3 text-right font-mono">
                {format.percent(list.adjustment)}
              </td>
              <td className="py-2 pr-3 text-right">
                {format.number(list._count.items)}
              </td>
              <td className="py-2 pr-3 text-right">
                {format.number(list._count.customers)}
              </td>
              <td className="py-2">
                <div className="flex items-start justify-end gap-4">
                  <Link
                    href={`/admin/price-lists/${list.id}`}
                    className="hover:underline"
                  >
                    {t.common.edit}
                  </Link>
                  <DeleteButton
                    action={deletePriceList.bind(null, list.id)}
                    confirmMessage={interpolate(t.priceLists.confirmDelete, {
                      name: list.name,
                    })}
                    labels={{
                      delete: t.common.delete,
                      deleting: t.common.deleting,
                    }}
                    disabledReason={
                      list._count.customers > 0 ? t.priceLists.inUse : undefined
                    }
                  />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
