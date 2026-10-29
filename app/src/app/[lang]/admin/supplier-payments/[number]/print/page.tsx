import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AllocationList } from "@/components/purchases/allocation-list";
import { formatDay } from "@/components/purchases/open-invoice-rows";
import { PaymentLines } from "@/components/purchases/payment-lines";
import { PrintButton } from "@/components/ui/print-button";
import { interpolate } from "@/i18n/config";
import { formatters } from "@/i18n/format";
import { getLocale, getT } from "@/i18n/server";
import { APP_NAME } from "@/lib/app";
import { getUserWithPermission } from "@/lib/auth";
import { parseSaleNumber } from "@/lib/checkout";
import { formatCuit } from "@/lib/cuit";
import { getSupplierPayment } from "@/lib/purchase-queries";

export async function generateMetadata({
  params,
}: PageProps<"/[lang]/admin/supplier-payments/[number]/print">): Promise<Metadata> {
  const t = await getT();
  return {
    title: interpolate(t.supplierPayments.detailTitle, {
      number: (await params).number,
    }),
  };
}

// El comprobante de la OP para firmar o mandar al proveedor.
export default async function SupplierPaymentPrintPage({
  params,
}: PageProps<"/[lang]/admin/supplier-payments/[number]/print">) {
  const t = await getT();
  return (
    <main className="mx-auto w-full max-w-3xl p-4 sm:p-8 print:p-0">
      {/* params y la OP son de request: van en Suspense. */}
      <Suspense
        fallback={<p className="text-sm opacity-70">{t.common.loading}</p>}
      >
        <PrintablePayment params={params} />
      </Suspense>
    </main>
  );
}

async function PrintablePayment({
  params,
}: {
  params: Promise<{ number: string }>;
}) {
  await getUserWithPermission("purchases:manage");
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const format = formatters(locale);
  const p = t.supplierPayments;

  const number = parseSaleNumber((await params).number);
  if (number === null) notFound();
  const payment = await getSupplierPayment(number);
  if (!payment) notFound();
  const supplier = payment.supplier;

  return (
    <>
      <div className="mb-4 flex gap-3 print:hidden">
        <PrintButton label={p.print} />
        <Link
          href={`/admin/supplier-payments/${payment.number}`}
          className="self-center text-sm hover:underline"
        >
          ← {interpolate(p.detailTitle, { number: payment.number })}
        </Link>
      </div>

      <header className="flex flex-wrap justify-between gap-4 border-b border-current/30 pb-3">
        <div>
          <h1 className="text-xl font-semibold">
            {interpolate(p.detailTitle, { number: payment.number })}
            {payment.annulledAt && ` · ${p.states.annulled}`}
          </h1>
          <p className="text-sm">
            {formatDay(format, payment.paidOn)} · {APP_NAME}
          </p>
        </div>
        <div className="text-sm">
          <p className="font-medium">{supplier.legalName}</p>
          <p>
            {interpolate(p.print_.cuit, { cuit: formatCuit(supplier.cuit) })}
          </p>
          {supplier.contactName && <p>{supplier.contactName}</p>}
          {supplier.contactPhone && <p>{supplier.contactPhone}</p>}
        </div>
      </header>

      <section className="mt-4">
        <PaymentLines
          lines={payment.lines}
          total={payment.total}
          t={p}
          format={format}
        />
      </section>
      {payment.allocations.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 font-medium">{p.allocationsTitle}</h2>
          <AllocationList
            allocations={payment.allocations}
            t={p}
            format={format}
            links={false}
          />
        </section>
      )}
      {payment.notes && <p className="mt-4 text-sm">{payment.notes}</p>}

      <footer className="mt-16 flex justify-end text-xs">
        <p className="w-64 border-t border-current/50 pt-1">
          {p.print_.receivedBy} — {p.print_.signature}
        </p>
      </footer>
    </>
  );
}
