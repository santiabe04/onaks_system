import type { Metadata } from "next";
import { Suspense } from "react";
import { getT } from "@/i18n/server";
import { getUserWithPermission } from "@/lib/auth";
import { getCityGroups } from "@/lib/city-options";
import { createWarehouse } from "../actions";
import { WarehouseForm } from "../warehouse-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.warehouses.newTitle };
}

export default async function NewWarehousePage() {
  const t = await getT();

  return (
    <main className="mx-auto w-full max-w-md p-4 sm:p-8">
      <h1 className="text-2xl font-semibold">{t.warehouses.newTitle}</h1>
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
  await getUserWithPermission("warehouses:manage");
  const [t, cityGroups] = await Promise.all([getT(), getCityGroups()]);

  return (
    <WarehouseForm
      action={createWarehouse}
      defaultValues={{
        name: "",
        address: "",
        cityId: "",
        phone: "",
        contactName: "",
        isActive: true,
      }}
      cityGroups={cityGroups}
      submitLabel={t.common.create}
      t={t.warehouses}
      common={t.common}
    />
  );
}
