import type { Metadata } from "next";
import { Suspense } from "react";
import { getT } from "@/i18n/server";
import { getUserWithPermission } from "@/lib/auth";
import { getCityGroups } from "@/lib/city-options";
import { createSupplier } from "../actions";
import { SupplierForm } from "../supplier-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.suppliers.newTitle };
}

export default async function NewSupplierPage() {
  const t = await getT();

  return (
    <main className="mx-auto w-full max-w-2xl p-4 sm:p-8">
      <h1 className="text-2xl font-semibold">{t.suppliers.newTitle}</h1>
      {/* Las localidades salen de la DB: va en Suspense. */}
      <Suspense
        fallback={<p className="mt-6 text-sm opacity-70">{t.common.loading}</p>}
      >
        <NewForm />
      </Suspense>
    </main>
  );
}

async function NewForm() {
  await getUserWithPermission("suppliers:manage");
  const [t, cityGroups] = await Promise.all([getT(), getCityGroups()]);

  return (
    <SupplierForm
      action={createSupplier}
      defaultValues={{
        legalName: "",
        tradeName: "",
        cuit: "",
        taxCondition: "",
        contactName: "",
        contactMail: "",
        contactPhone: "",
        address: "",
        cityId: "",
        isActive: true,
      }}
      cityGroups={cityGroups}
      cancelHref="/admin/suppliers"
      submitLabel={t.common.create}
      t={t.suppliers}
      taxConditions={t.taxConditions}
      common={t.common}
    />
  );
}
