import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { formatDay } from "@/components/purchases/open-invoice-rows";
import { formatters } from "@/i18n/format";
import { getLocale, getT } from "@/i18n/server";
import { getUserWithPermission } from "@/lib/auth";
import { db } from "@/lib/db";

const PATH = "/admin/supplier-payments";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.supplierPayments.title };
}

export default async function SupplierPaymentsPage() {
  const t = await getT();
  return (
    <main className="mx-auto w-full max-w-5xl p-4 sm:p-8">
      <h1 className="text-2xl font-semibold">{t.supplierPayments.title}</h1>
      {/* Las órdenes salen de la DB: van en Suspense. */}
      <Suspense
        fallback={<p className="mt-6 text-sm opacity-70">{t.common.loading}</p>}
      >
        <Payments />
      </Suspense>
    </main>
  );
}

async function Payments() {
  await getUserWithPermission("purchases:manage");
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const format = formatters(locale);
  const p = t.supplierPayments;
  const c = p.columns;

  const payments = await db.supplierPayment.findMany({
    orderBy: { number: "desc" },
    take: 100,
    select: {
      number: true,
      paidOn: true,
      total: true,
      annulledAt: true,
      supplier: { select: { id: true, legalName: true, tradeName: true } },
      lines: { select: { method: true } },
    },
  });

  if (payments.length === 0) {
    return <p className="mt-6 text-sm opacity-70">{p.empty}</p>;
  }
  return (
    <div className="overflow-x-auto print:overflow-visible">
      <table className="mt-6 w-full text-left text-sm">
        <thead className="border-b border-current/20">
          <tr>
            <th className="py-2 pr-3 font-medium">{c.number}</th>
            <th className="py-2 pr-3 font-medium">{c.date}</th>
            <th className="py-2 pr-3 font-medium">{c.supplier}</th>
            <th className="py-2 pr-3 font-medium">{c.detail}</th>
            <th className="py-2 pr-3 font-medium">{c.state}</th>
            <th className="py-2 text-right font-medium">{c.total}</th>
          </tr>
        </thead>
        <tbody>
          {payments.map((payment) => (
            <tr key={payment.number} className="border-b border-current/10">
              <td className="py-2 pr-3">
                <Link
                  href={`${PATH}/${payment.number}`}
                  className="font-medium hover:underline"
                >
                  #{payment.number}
                </Link>
              </td>
              <td className="py-2 pr-3 whitespace-nowrap">
                {formatDay(format, payment.paidOn)}
              </td>
              <td className="py-2 pr-3">
                <Link
                  href={`/admin/suppliers/${payment.supplier.id}/account`}
                  className="hover:underline"
                >
                  {payment.supplier.tradeName ?? payment.supplier.legalName}
                </Link>
              </td>
              <td className="py-2 pr-3">
                {[...new Set(payment.lines.map((line) => line.method))]
                  .map((method) => p.methods[method])
                  .join(", ")}
              </td>
              <td
                className={`py-2 pr-3 ${payment.annulledAt ? "text-red-600" : ""}`}
              >
                {payment.annulledAt ? p.states.annulled : p.states.active}
              </td>
              <td className="py-2 text-right whitespace-nowrap">
                {format.money(payment.total)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
