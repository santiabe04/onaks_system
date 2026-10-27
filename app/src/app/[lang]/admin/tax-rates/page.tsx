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
import { deleteTaxRate } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.taxRates.title };
}

export default async function TaxRatesPage() {
  const t = await getT();

  return (
    <main className="mx-auto w-full max-w-3xl p-8">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{t.taxRates.title}</h1>
        <Link href="/admin/tax-rates/new" className={buttonClass()}>
          {t.taxRates.newButton}
        </Link>
      </div>

      {/* La lista sale de la DB en cada request: va en Suspense (cacheComponents). */}
      <Suspense
        fallback={<p className="mt-6 text-sm opacity-70">{t.common.loading}</p>}
      >
        <TaxRatesTable />
      </Suspense>
    </main>
  );
}

async function TaxRatesTable() {
  await getUserWithPermission("tax-rates:manage");
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const format = formatters(locale);

  const taxRates = await db.taxRate.findMany({
    orderBy: [{ isActive: "desc" }, { rate: "desc" }, { name: "asc" }],
    include: { _count: { select: { products: true } } },
  });

  if (taxRates.length === 0) {
    return <p className="mt-6 text-sm opacity-70">{t.taxRates.empty}</p>;
  }

  return (
    <table className="mt-6 w-full text-left text-sm">
      <thead className="border-b border-current/20">
        <tr>
          <th className="py-2 pr-3 font-medium">{t.taxRates.name}</th>
          <th className="py-2 pr-3 text-right font-medium">
            {t.taxRates.percent}
          </th>
          <th className="py-2 pr-3 text-right font-medium">
            {t.taxRates.products}
          </th>
          <th className="py-2 pr-3 font-medium">{t.taxRates.status}</th>
          <th className="py-2">
            <span className="sr-only">{t.common.actions}</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {taxRates.map((taxRate) => (
          <tr
            key={taxRate.id}
            className={`border-b border-current/10 align-top ${
              taxRate.isActive ? "" : "opacity-60"
            }`}
          >
            <td className="py-2 pr-3">{taxRate.name}</td>
            <td className="py-2 pr-3 text-right font-mono">
              {format.percent(taxRate.rate)}
            </td>
            <td className="py-2 pr-3 text-right">
              {format.number(taxRate._count.products)}
            </td>
            <td className="py-2 pr-3">
              {taxRate.isActive ? t.taxRates.active : t.taxRates.inactive}
            </td>
            <td className="py-2">
              <div className="flex items-start justify-end gap-4">
                <Link
                  href={`/admin/tax-rates/${taxRate.id}/edit`}
                  className="hover:underline"
                >
                  {t.common.edit}
                </Link>
                <DeleteButton
                  action={deleteTaxRate.bind(null, taxRate.id)}
                  confirmMessage={interpolate(t.taxRates.confirmDelete, {
                    name: taxRate.name,
                  })}
                  labels={{
                    delete: t.common.delete,
                    deleting: t.common.deleting,
                  }}
                  disabledReason={
                    taxRate._count.products > 0 ? t.taxRates.inUse : undefined
                  }
                />
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
