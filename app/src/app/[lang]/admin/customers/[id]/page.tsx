import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { buttonClass } from "@/components/ui/button";
import { DeleteButton } from "@/components/ui/delete-button";
import { interpolate } from "@/i18n/config";
import { getT } from "@/i18n/server";
import { formatCuit } from "@/lib/cuit";
import { deleteAddress, deleteCustomer, deletePerson } from "../actions";
import { loadCustomer } from "../data";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.customers.title };
}

export default async function CustomerPage({
  params,
}: PageProps<"/[lang]/admin/customers/[id]">) {
  const t = await getT();

  return (
    <main className="mx-auto w-full max-w-5xl p-8">
      {/* params y la DB son de request: va en Suspense. */}
      <Suspense
        fallback={<p className="text-sm opacity-70">{t.common.loading}</p>}
      >
        <CustomerDetail params={params} />
      </Suspense>
    </main>
  );
}

async function CustomerDetail({ params }: { params: Promise<{ id: string }> }) {
  const customer = await loadCustomer((await params).id);
  const t = await getT();
  const c = t.customers;
  const base = `/admin/customers/${customer.id}`;
  const labels = { delete: t.common.delete, deleting: t.common.deleting };

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{customer.tradeName}</h1>
          <p className="text-sm opacity-70">
            {customer.legalName} · CUIT {formatCuit(customer.cuit)} ·{" "}
            {t.taxConditions[customer.taxCondition]}
          </p>
        </div>
        <div className="flex items-start gap-4 text-sm">
          <Link href={`${base}/edit`} className={buttonClass("secondary")}>
            {t.common.edit}
          </Link>
          <DeleteButton
            action={deleteCustomer.bind(null, customer.id)}
            confirmMessage={interpolate(c.confirmDelete, {
              name: customer.tradeName,
            })}
            labels={labels}
          />
        </div>
      </div>

      <section className="mt-10">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-lg font-medium">{c.persons}</h2>
          <Link
            href={`${base}/persons/new`}
            className="text-sm hover:underline"
          >
            {c.newPerson}
          </Link>
        </div>
        {customer.persons.length === 0 ? (
          <p className="mt-3 text-sm opacity-70">{c.personsEmpty}</p>
        ) : (
          <table className="mt-3 w-full text-left text-sm">
            <thead className="border-b border-current/20">
              <tr>
                <th className="py-2 pr-3 font-medium">{c.name}</th>
                <th className="py-2 pr-3 font-medium">{c.mail}</th>
                <th className="py-2 pr-3 font-medium">{c.phone}</th>
                <th className="py-2 pr-3 font-medium">{c.user}</th>
                <th className="py-2">
                  <span className="sr-only">{t.common.actions}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {customer.persons.map((person) => (
                <tr
                  key={person.id}
                  className="border-b border-current/10 align-top"
                >
                  <td className="py-2 pr-3">
                    {person.name} {person.surname}
                  </td>
                  <td className="py-2 pr-3">{person.mail}</td>
                  <td className="py-2 pr-3">{person.phone ?? "—"}</td>
                  {/* El alta de usuarios llega en el próximo PR. */}
                  <td className="py-2 pr-3">
                    {person.user ? (
                      "✓"
                    ) : (
                      <span className="opacity-60">{c.noUser}</span>
                    )}
                  </td>
                  <td className="py-2">
                    <div className="flex items-start justify-end gap-4">
                      <Link
                        href={`${base}/persons/${person.id}/edit`}
                        className="hover:underline"
                      >
                        {t.common.edit}
                      </Link>
                      <DeleteButton
                        action={deletePerson.bind(null, customer.id, person.id)}
                        confirmMessage={interpolate(c.confirmDeletePerson, {
                          name: `${person.name} ${person.surname}`,
                        })}
                        labels={labels}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="mt-10">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-lg font-medium">{c.addresses}</h2>
          <Link
            href={`${base}/addresses/new`}
            className="text-sm hover:underline"
          >
            {c.newAddress}
          </Link>
        </div>
        {customer.addresses.length === 0 ? (
          <p className="mt-3 text-sm opacity-70">{c.addressesEmpty}</p>
        ) : (
          <table className="mt-3 w-full text-left text-sm">
            <thead className="border-b border-current/20">
              <tr>
                <th className="py-2 pr-3 font-medium">{c.addressName}</th>
                <th className="py-2 pr-3 font-medium">{c.address}</th>
                <th className="py-2 pr-3 font-medium">{c.city}</th>
                <th className="py-2">
                  <span className="sr-only">{t.common.actions}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {customer.addresses.map((address) => (
                <tr
                  key={address.id}
                  className="border-b border-current/10 align-top"
                >
                  <td className="py-2 pr-3 font-medium">{address.name}</td>
                  <td className="py-2 pr-3">
                    {address.address}
                    {address.zipCode && ` (${address.zipCode})`}
                    {address.description && (
                      <span className="block text-xs opacity-70">
                        {address.description}
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-3">{address.city.name}</td>
                  <td className="py-2">
                    <div className="flex items-start justify-end gap-4">
                      <Link
                        href={`${base}/addresses/${address.id}/edit`}
                        className="hover:underline"
                      >
                        {t.common.edit}
                      </Link>
                      <DeleteButton
                        action={deleteAddress.bind(
                          null,
                          customer.id,
                          address.id,
                        )}
                        confirmMessage={interpolate(c.confirmDeleteAddress, {
                          name: address.name,
                        })}
                        labels={labels}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
