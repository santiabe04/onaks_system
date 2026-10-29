import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { PaymentForm } from "@/components/purchases/account-forms";
import { openInvoiceRows } from "@/components/purchases/open-invoice-rows";
import { interpolate } from "@/i18n/config";
import { formatters } from "@/i18n/format";
import { getLocale, getT } from "@/i18n/server";
import { getUserWithPermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { isCuid } from "@/lib/ids";
import { isoDay } from "@/lib/order-period";
import { loadSupplierAccount } from "@/lib/supplier-account-ledger";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.supplierPayments.title };
}

export default async function NewSupplierPaymentPage({
  searchParams,
}: PageProps<"/[lang]/admin/supplier-payments/new">) {
  const t = await getT();
  return (
    <main className="mx-auto w-full max-w-5xl p-4 sm:p-8">
      {/* El proveedor viene de la URL: va en Suspense. */}
      <Suspense
        fallback={<p className="text-sm opacity-70">{t.common.loading}</p>}
      >
        <NewPayment searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function NewPayment({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await getUserWithPermission("purchases:manage");
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const format = formatters(locale);

  const { supplier: supplierId } = await searchParams;
  if (!isCuid(supplierId)) notFound();
  const supplier = await db.supplier.findUnique({
    where: { id: supplierId },
    select: { id: true, legalName: true, tradeName: true },
  });
  if (!supplier) notFound();
  const name = supplier.tradeName ?? supplier.legalName;

  await connection();
  const account = await loadSupplierAccount(db, supplier.id);

  return (
    <>
      <Link
        href={`/admin/suppliers/${supplier.id}/account`}
        className="text-sm hover:underline"
      >
        ← {interpolate(t.supplierAccount.of, { supplier: name })}
      </Link>
      <h1 className="mt-2 mb-6 text-2xl font-semibold">
        {interpolate(t.supplierPayments.newTitle, { supplier: name })}
      </h1>
      <PaymentForm
        supplierId={supplier.id}
        invoices={openInvoiceRows(account, format)}
        today={isoDay(new Date())}
        locale={locale}
        t={t.supplierPayments}
      />
    </>
  );
}
