import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getT } from "@/i18n/server";
import { getCityGroups } from "@/lib/city-options";
import { saveAddress } from "../../../../actions";
import { loadCustomer } from "../../../../data";
import { AddressForm } from "../../../../forms";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.customers.editAddressTitle };
}

export default async function EditAddressPage({
  params,
}: PageProps<"/[lang]/admin/customers/[id]/addresses/[addressId]/edit">) {
  const t = await getT();

  return (
    <main className="mx-auto w-full max-w-xl p-4 sm:p-8">
      <h1 className="text-2xl font-semibold">{t.customers.editAddressTitle}</h1>
      <Suspense
        fallback={<p className="mt-6 text-sm opacity-70">{t.common.loading}</p>}
      >
        <EditForm params={params} />
      </Suspense>
    </main>
  );
}

async function EditForm({
  params,
}: {
  params: Promise<{ id: string; addressId: string }>;
}) {
  const { id, addressId } = await params;
  const customer = await loadCustomer(id);
  const address = customer.addresses.find((a) => a.id === addressId);
  if (!address) notFound();
  const [t, cityGroups] = await Promise.all([getT(), getCityGroups()]);

  return (
    <>
      <p className="mt-1 text-sm opacity-70">{customer.tradeName}</p>
      <AddressForm
        action={saveAddress.bind(null, customer.id, address.id)}
        defaultValues={{
          name: address.name,
          address: address.address,
          cityId: String(address.cityId),
          zipCode: address.zipCode ?? "",
          description: address.description ?? "",
        }}
        cityGroups={cityGroups}
        cancelHref={`/admin/customers/${customer.id}`}
        submitLabel={t.common.save}
        t={t.customers}
        common={t.common}
      />
    </>
  );
}
