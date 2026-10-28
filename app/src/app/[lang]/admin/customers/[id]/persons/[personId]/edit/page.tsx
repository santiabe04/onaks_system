import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getT } from "@/i18n/server";
import { savePerson } from "../../../../actions";
import { loadCustomer } from "../../../../data";
import { PersonForm } from "../../../../forms";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.customers.editPersonTitle };
}

export default async function EditPersonPage({
  params,
}: PageProps<"/[lang]/admin/customers/[id]/persons/[personId]/edit">) {
  const t = await getT();

  return (
    <main className="mx-auto w-full max-w-xl p-8">
      <h1 className="text-2xl font-semibold">{t.customers.editPersonTitle}</h1>
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
  params: Promise<{ id: string; personId: string }>;
}) {
  const { id, personId } = await params;
  const customer = await loadCustomer(id);
  const person = customer.persons.find((p) => p.id === personId);
  if (!person) notFound();
  const t = await getT();

  return (
    <>
      <p className="mt-1 text-sm opacity-70">{customer.tradeName}</p>
      <PersonForm
        action={savePerson.bind(null, customer.id, person.id)}
        defaultValues={{
          name: person.name,
          surname: person.surname,
          mail: person.mail,
          phone: person.phone ?? "",
        }}
        cancelHref={`/admin/customers/${customer.id}`}
        submitLabel={t.common.save}
        t={t.customers}
        common={t.common}
      />
    </>
  );
}
