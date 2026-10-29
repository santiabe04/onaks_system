import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getT } from "@/i18n/server";
import { getUserWithPermission } from "@/lib/auth";
import { getCityGroups } from "@/lib/city-options";
import { formatCuit } from "@/lib/cuit";
import { db } from "@/lib/db";
import { isCuid } from "@/lib/ids";
import { updateSupplier } from "../../actions";
import { SupplierForm } from "../../supplier-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.suppliers.editTitle };
}

export default async function EditSupplierPage({
  params,
}: PageProps<"/[lang]/admin/suppliers/[id]/edit">) {
  const t = await getT();

  return (
    <main className="mx-auto w-full max-w-2xl p-4 sm:p-8">
      <h1 className="text-2xl font-semibold">{t.suppliers.editTitle}</h1>
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
  await getUserWithPermission("suppliers:manage");
  const { id } = await params;
  if (!isCuid(id)) notFound();

  const [t, cityGroups, supplier] = await Promise.all([
    getT(),
    getCityGroups(),
    db.supplier.findUnique({ where: { id } }),
  ]);
  if (!supplier) notFound();

  return (
    <SupplierForm
      action={updateSupplier.bind(null, supplier.id)}
      defaultValues={{
        legalName: supplier.legalName,
        tradeName: supplier.tradeName ?? "",
        cuit: formatCuit(supplier.cuit),
        taxCondition: supplier.taxCondition,
        contactName: supplier.contactName ?? "",
        contactMail: supplier.contactMail ?? "",
        contactPhone: supplier.contactPhone ?? "",
        address: supplier.address ?? "",
        cityId: supplier.cityId === null ? "" : String(supplier.cityId),
        isActive: supplier.isActive,
      }}
      cityGroups={cityGroups}
      cancelHref={`/admin/suppliers/${supplier.id}`}
      submitLabel={t.common.save}
      t={t.suppliers}
      taxConditions={t.taxConditions}
      common={t.common}
    />
  );
}
