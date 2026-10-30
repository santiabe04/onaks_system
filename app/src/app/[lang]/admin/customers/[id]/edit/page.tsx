import type { Metadata } from "next";
import { Suspense } from "react";
import { getT } from "@/i18n/server";
import { formatCuit } from "@/lib/cuit";
import { db } from "@/lib/db";
import { formatters } from "@/i18n/format";
import { getLocale } from "@/i18n/server";
import { fractionToPercent } from "@/lib/tax-rate";
import { updateCustomer } from "../../actions";
import { loadCustomer } from "../../data";
import { CustomerForm } from "../../forms";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.customers.editTitle };
}

export default async function EditCustomerPage({
  params,
}: PageProps<"/[lang]/admin/customers/[id]/edit">) {
  const t = await getT();

  return (
    <main className="mx-auto w-full max-w-xl p-4 sm:p-8">
      <h1 className="text-2xl font-semibold">{t.customers.editTitle}</h1>
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
  const customer = await loadCustomer((await params).id);
  const [t, locale, priceLists] = await Promise.all([
    getT(),
    getLocale(),
    db.priceList.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);
  const discount = fractionToPercent(customer.discountRate);

  return (
    <CustomerForm
      action={updateCustomer.bind(null, customer.id)}
      defaultValues={{
        tradeName: customer.tradeName,
        legalName: customer.legalName,
        cuit: formatCuit(customer.cuit),
        taxCondition: customer.taxCondition,
        priceListId: customer.priceListId ?? "",
        discount: discount ? formatters(locale).number(discount) : "",
      }}
      taxConditions={t.taxConditions}
      priceLists={priceLists}
      cancelHref={`/admin/customers/${customer.id}`}
      submitLabel={t.common.save}
      t={t.customers}
      common={t.common}
    />
  );
}
