import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getT } from "@/i18n/server";
import { getUserWithPermission } from "@/lib/auth";
import { getCityGroups } from "@/lib/city-options";
import { db } from "@/lib/db";
import { updateWarehouse } from "../../actions";
import { WarehouseForm } from "../../warehouse-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.warehouses.editTitle };
}

export default async function EditWarehousePage({
  params,
}: PageProps<"/[lang]/admin/warehouses/[id]/edit">) {
  const t = await getT();

  return (
    <main className="mx-auto w-full max-w-md p-8">
      <h1 className="text-2xl font-semibold">{t.warehouses.editTitle}</h1>
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
  await getUserWithPermission("warehouses:manage");
  const { id } = await params;

  const [t, cityGroups, warehouse] = await Promise.all([
    getT(),
    getCityGroups(),
    db.warehouse.findUnique({ where: { id } }),
  ]);
  if (!warehouse) notFound();

  return (
    <WarehouseForm
      action={updateWarehouse.bind(null, warehouse.id)}
      defaultValues={{
        name: warehouse.name,
        address: warehouse.address,
        cityId: String(warehouse.cityId),
        phone: warehouse.phone ?? "",
        contactName: warehouse.contactName ?? "",
        isActive: warehouse.isActive,
      }}
      cityGroups={cityGroups}
      submitLabel={t.common.save}
      t={t.warehouses}
      common={t.common}
    />
  );
}
