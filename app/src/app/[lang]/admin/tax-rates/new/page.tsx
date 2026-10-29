import type { Metadata } from "next";
import { getT } from "@/i18n/server";
import { createTaxRate } from "../actions";
import { TaxRateForm } from "../tax-rate-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.taxRates.newTitle };
}

export default async function NewTaxRatePage() {
  const t = await getT();

  return (
    <main className="mx-auto w-full max-w-md p-4 sm:p-8">
      <h1 className="text-2xl font-semibold">{t.taxRates.newTitle}</h1>
      <TaxRateForm
        action={createTaxRate}
        defaultValues={{ name: "", percent: "", isActive: true }}
        submitLabel={t.common.create}
        t={t.taxRates}
        common={t.common}
      />
    </main>
  );
}
