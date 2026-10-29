import type { Metadata } from "next";
import { getT } from "@/i18n/server";
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
      <CustomerForm
        action={createCustomer}
        defaultValues={{
          tradeName: "",
          legalName: "",
          cuit: "",
          taxCondition: "",
        }}
        taxConditions={t.taxConditions}
        cancelHref="/admin/customers"
        submitLabel={t.common.create}
        t={t.customers}
        common={t.common}
      />
    </main>
  );
}
