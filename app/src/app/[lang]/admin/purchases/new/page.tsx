import type { Metadata } from "next";
import { Suspense } from "react";
import { NewPurchaseForm } from "@/components/purchases/purchase-forms";
import { getT } from "@/i18n/server";
import { getUserWithPermission } from "@/lib/auth";
import { db } from "@/lib/db";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.purchases.newTitle };
}

export default async function NewPurchasePage() {
  const t = await getT();
  return (
    <main className="mx-auto w-full max-w-md p-8">
      <h1 className="mb-6 text-2xl font-semibold">{t.purchases.newTitle}</h1>
      {/* Los proveedores salen de la DB: van en Suspense. */}
      <Suspense
        fallback={<p className="text-sm opacity-70">{t.common.loading}</p>}
      >
        <NewPurchase />
      </Suspense>
    </main>
  );
}

async function NewPurchase() {
  await getUserWithPermission("purchases:manage");
  const t = await getT();
  const suppliers = await db.supplier.findMany({
    where: { isActive: true },
    orderBy: { legalName: "asc" },
    select: { id: true, legalName: true, tradeName: true },
  });
  return (
    <NewPurchaseForm
      suppliers={suppliers.map((supplier) => ({
        id: supplier.id,
        name: supplier.tradeName ?? supplier.legalName,
      }))}
      t={t.purchases}
    />
  );
}
