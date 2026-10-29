import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { formatters } from "@/i18n/format";
import { getLocale, getT } from "@/i18n/server";
import { getUserWithPermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { fractionToPercent, parseTaxRateId } from "@/lib/tax-rate";
import { updateTaxRate } from "../../actions";
import { TaxRateForm } from "../../tax-rate-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.taxRates.editTitle };
}

export default async function EditTaxRatePage({
  params,
}: PageProps<"/[lang]/admin/tax-rates/[id]/edit">) {
  const t = await getT();

  return (
    <main className="mx-auto w-full max-w-md p-4 sm:p-8">
      <h1 className="text-2xl font-semibold">{t.taxRates.editTitle}</h1>
      {/* params y la query a la DB son de request: van en Suspense. */}
      <Suspense
        fallback={<p className="mt-6 text-sm opacity-70">{t.common.loading}</p>}
      >
        <EditForm params={params} />
      </Suspense>
    </main>
  );
}

async function EditForm({ params }: { params: Promise<{ id: string }> }) {
  await getUserWithPermission("tax-rates:manage");
  const [t, locale] = await Promise.all([getT(), getLocale()]);

  const taxRateId = parseTaxRateId((await params).id);
  if (taxRateId === null) notFound();

  const taxRate = await db.taxRate.findUnique({ where: { id: taxRateId } });
  if (!taxRate) notFound();

  return (
    <TaxRateForm
      action={updateTaxRate.bind(null, taxRate.id)}
      defaultValues={{
        name: taxRate.name,
        // Con el separador decimal del idioma: "10,5" en español.
        percent: formatters(locale).number(fractionToPercent(taxRate.rate)),
        isActive: taxRate.isActive,
      }}
      submitLabel={t.common.save}
      t={t.taxRates}
      common={t.common}
    />
  );
}
