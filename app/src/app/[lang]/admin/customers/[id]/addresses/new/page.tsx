import type { Metadata } from "next";
import { Suspense } from "react";
import { getT } from "@/i18n/server";
import { getCityGroups } from "@/lib/city-options";
import { saveAddress } from "../../../actions";
import { loadCustomer } from "../../../data";
import { AddressForm } from "../../../forms";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.customers.newAddressTitle };
}

export default async function NewAddressPage({
  params,
}: PageProps<"/[lang]/admin/customers/[id]/addresses/new">) {
  const t = await getT();

  return (
    <main className="mx-auto w-full max-w-xl p-8">
      <h1 className="text-2xl font-semibold">{t.customers.newAddressTitle}</h1>
      <Suspense
        fallback={<p className="mt-6 text-sm opacity-70">{t.common.loading}</p>}
      >
        <NewForm params={params} />
      </Suspense>
    </main>
  );
}

async function NewForm({ params }: { params: Promise<{ id: string }> }) {
  const customer = await loadCustomer((await params).id);
  const [t, cityGroups] = await Promise.all([getT(), getCityGroups()]);

  return (
    <>
      <p className="mt-1 text-sm opacity-70">{customer.tradeName}</p>
      <AddressForm
        action={saveAddress.bind(null, customer.id, null)}
        defaultValues={{
          name: "",
          address: "",
          cityId: "",
          zipCode: "",
          description: "",
        }}
        cityGroups={cityGroups}
        cancelHref={`/admin/customers/${customer.id}`}
        submitLabel={t.common.create}
        t={t.customers}
        common={t.common}
      />
    </>
  );
}
