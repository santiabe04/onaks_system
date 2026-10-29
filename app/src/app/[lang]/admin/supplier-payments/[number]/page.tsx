import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { AllocateForm } from "@/components/purchases/account-forms";
import { AllocationList } from "@/components/purchases/allocation-list";
import {
  formatDay,
  openInvoiceRows,
} from "@/components/purchases/open-invoice-rows";
import { PaymentLines } from "@/components/purchases/payment-lines";
import { ReasonForm } from "@/components/purchases/receipt-forms";
import { buttonClass } from "@/components/ui/button";
import { interpolate } from "@/i18n/config";
import { formatters } from "@/i18n/format";
import { getLocale, getT } from "@/i18n/server";
import { toCents } from "@/lib/account";
import { getUserWithPermission } from "@/lib/auth";
import { parseSaleNumber } from "@/lib/checkout";
import { db } from "@/lib/db";
import { getSupplierPayment } from "@/lib/purchase-queries";
import {
  PAYMENT_NOTES_MAX_LENGTH,
  unallocatedOf,
} from "@/lib/supplier-account";
import { loadSupplierAccount } from "@/lib/supplier-account-ledger";
import { allocateSupplierPayment, annulSupplierPayment } from "../actions";

export async function generateMetadata({
  params,
}: PageProps<"/[lang]/admin/supplier-payments/[number]">): Promise<Metadata> {
  const t = await getT();
  return {
    title: interpolate(t.supplierPayments.detailTitle, {
      number: (await params).number,
    }),
  };
}

export default async function SupplierPaymentPage({
  params,
}: PageProps<"/[lang]/admin/supplier-payments/[number]">) {
  const t = await getT();
  return (
    <main className="mx-auto w-full max-w-5xl p-4 sm:p-8">
      <Link href="/admin/supplier-payments" className="text-sm hover:underline">
        ← {t.supplierPayments.title}
      </Link>
      {/* params y la OP son de request: van en Suspense. */}
      <Suspense
        fallback={<p className="mt-6 text-sm opacity-70">{t.common.loading}</p>}
      >
        <Payment params={params} />
      </Suspense>
    </main>
  );
}

async function Payment({ params }: { params: Promise<{ number: string }> }) {
  await getUserWithPermission("purchases:manage");
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const format = formatters(locale);
  const p = t.supplierPayments;

  const number = parseSaleNumber((await params).number);
  if (number === null) notFound();
  const payment = await getSupplierPayment(number);
  if (!payment) notFound();
  const supplierName = payment.supplier.tradeName ?? payment.supplier.legalName;
  const fullName = (user: typeof payment.createdBy) =>
    user ? `${user.person.name} ${user.person.surname}` : "—";
  const annulled = payment.annulledAt !== null;
  const available = unallocatedOf({
    total: payment.total,
    annulled,
    allocations: payment.allocations,
  });

  // Para imputar lo que quedó a cuenta hacen falta las facturas con saldo.
  await connection();
  const openRows =
    toCents(available) > BigInt(0)
      ? openInvoiceRows(
          await loadSupplierAccount(db, payment.supplierId),
          format,
        )
      : [];

  return (
    <>
      <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold">
          {interpolate(p.detailTitle, { number: payment.number })}
        </h1>
        <span
          className={`rounded border border-current/20 px-2 py-0.5 text-sm ${annulled ? "text-red-600" : ""}`}
        >
          {annulled ? p.states.annulled : p.states.active}
        </span>
      </div>
      <p className="mt-1 text-sm">
        <Link
          href={`/admin/suppliers/${payment.supplier.id}/account`}
          className="hover:underline"
        >
          {supplierName}
        </Link>{" "}
        · {p.paidOn}: {formatDay(format, payment.paidOn)}
      </p>
      {payment.notes && <p className="mt-1 text-sm">{payment.notes}</p>}
      <p className="mt-1 text-xs opacity-70">
        {interpolate(p.createdBy, {
          user: fullName(payment.createdBy),
          date: format.dateTime(payment.createdAt),
        })}
      </p>
      {annulled && payment.annulledAt && (
        <p className="mt-2 text-sm text-red-600">
          {interpolate(p.annulled, {
            date: format.dateTime(payment.annulledAt),
            user: fullName(payment.annulledBy),
            reason: payment.annulReason ?? "",
          })}
        </p>
      )}

      <div className="mt-4">
        <Link
          href={`/admin/supplier-payments/${payment.number}/print`}
          className={buttonClass("secondary")}
        >
          {p.print}
        </Link>
      </div>

      <h2 className="mt-6 mb-2 text-lg font-medium">{p.methodsTitle}</h2>
      <PaymentLines
        lines={payment.lines}
        total={payment.total}
        t={p}
        format={format}
      />

      <h2 className="mt-6 mb-2 text-lg font-medium">{p.allocationsTitle}</h2>
      <AllocationList allocations={payment.allocations} t={p} format={format} />
      {toCents(available) > BigInt(0) && (
        <p className="mt-2 text-sm">
          {p.onAccount}: {format.money(available)}
        </p>
      )}

      <div className="mt-8 flex flex-col gap-4">
        {openRows.length > 0 && (
          <AllocateForm
            action={allocateSupplierPayment.bind(null, payment.id)}
            invoices={openRows}
            available={available}
            title={interpolate(p.allocateTitle, {
              amount: format.money(available),
            })}
            locale={locale}
            t={p}
          />
        )}
        {!annulled && (
          <ReasonForm
            action={annulSupplierPayment.bind(null, payment.id)}
            label={p.annul}
            hint={p.annulHint}
            reasonLabel={p.reason}
            pendingLabel={p.working}
            maxLength={PAYMENT_NOTES_MAX_LENGTH}
          />
        )}
      </div>
    </>
  );
}
