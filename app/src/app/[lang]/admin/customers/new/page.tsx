import type { Metadata } from "next";
import { Suspense } from "react";
import { getT } from "@/i18n/server";
import { getUserWithPermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { createCustomer } from "../actions";
import { CustomerForm } from "../forms";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.customers.newTitle };
}

export default async function NewCustomerPage() {
  const t = await getT();

  return (
    <main className="mx-auto w-full max-w-xl p-4 sm:p-8">
      <h1 className="text-2xl font-semibold">{t.customers.newTitle}</h1>
      {/* Las listas de precios salen de la DB: va en Suspense. */}
      <Suspense
        fallback={<p className="mt-6 text-sm opacity-70">{t.common.loading}</p>}
      >
        <NewCustomerForm />
      </Suspense>
    </main>
  );
}

async function NewCustomerForm() {
  await getUserWithPermission("customers:manage");
  const [t, priceLists] = await Promise.all([
    getT(),
    db.priceList.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <CustomerForm
      action={createCustomer}
      defaultValues={{
        tradeName: "",
        legalName: "",
        cuit: "",
        taxCondition: "",
        priceListId: "",
        discount: "",
      }}
      taxConditions={t.taxConditions}
      priceLists={priceLists}
      cancelHref="/admin/customers"
      submitLabel={t.common.create}
      t={t.customers}
      common={t.common}
    />
  );
}
