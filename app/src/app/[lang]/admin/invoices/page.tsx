import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { InvoiceState } from "@/components/purchases/invoice-state";
import { interpolate } from "@/i18n/config";
import { formatters } from "@/i18n/format";
import { getLocale, getT } from "@/i18n/server";
import { getUserWithPermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatInvoiceNumber } from "@/lib/supplier-invoice";

const PATH = "/admin/invoices";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.invoices.title };
}

export default async function InvoicesPage({
  searchParams,
}: PageProps<"/[lang]/admin/invoices">) {
  const t = await getT();
  return (
    <main className="mx-auto w-full max-w-5xl p-8">
      <h1 className="text-2xl font-semibold">{t.invoices.title}</h1>
      {/* El filtro viene de la URL y las facturas de la DB: van en Suspense. */}
      <Suspense
        fallback={<p className="mt-6 text-sm opacity-70">{t.common.loading}</p>}
      >
        <Invoices searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Invoices({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await getUserWithPermission("purchases:manage");
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const format = formatters(locale);
  const i = t.invoices;
  const c = i.columns;
  const onlyFlagged = (await searchParams).flagged === "1";

  const [invoices, flagged] = await Promise.all([
    db.supplierInvoice.findMany({
      where: onlyFlagged ? { state: "FLAGGED" } : {},
      orderBy: [{ issueDate: "desc" }, { createdAt: "desc" }],
      take: 100,
      select: {
        id: true,
        type: true,
        pointOfSale: true,
        number: true,
        issueDate: true,
        dueDate: true,
        total: true,
        state: true,
        purchaseOrder: { select: { number: true } },
        supplier: { select: { legalName: true, tradeName: true } },
      },
    }),
    db.supplierInvoice.count({ where: { state: "FLAGGED" } }),
  ]);
  // Fechas sin hora: se muestran al mediodía para que la zona no cambie el día.
  const day = (date: Date) =>
    format.date(new Date(`${date.toISOString().slice(0, 10)}T12:00:00-03:00`));

  return (
    <>
      <div className="mt-4 flex flex-wrap gap-x-6 text-sm">
        {flagged > 0 && !onlyFlagged && (
          <Link
            href={`${PATH}?flagged=1`}
            className="font-medium text-amber-700 hover:underline dark:text-amber-400"
          >
            {interpolate(i.flaggedCount, { count: flagged })}
          </Link>
        )}
        {onlyFlagged && (
          <Link href={PATH} className="hover:underline">
            {i.showAll}
          </Link>
        )}
      </div>
      {invoices.length === 0 ? (
        <p className="mt-6 text-sm opacity-70">{i.empty}</p>
      ) : (
        <table className="mt-4 w-full text-left text-sm">
          <thead className="border-b border-current/20">
            <tr>
              <th className="py-2 pr-3 font-medium">{c.invoice}</th>
              <th className="py-2 pr-3 font-medium">{c.date}</th>
              <th className="py-2 pr-3 font-medium">{c.supplier}</th>
              <th className="py-2 pr-3 font-medium">{c.order}</th>
              <th className="py-2 pr-3 font-medium">{i.due}</th>
              <th className="py-2 pr-3 font-medium">{c.state}</th>
              <th className="py-2 text-right font-medium">{c.total}</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((invoice) => (
              <tr key={invoice.id} className="border-b border-current/10">
                <td className="py-2 pr-3 whitespace-nowrap">
                  <Link
                    href={`${PATH}/${invoice.id}`}
                    className="font-mono font-medium hover:underline"
                  >
                    {formatInvoiceNumber(invoice)}
                  </Link>
                </td>
                <td className="py-2 pr-3 whitespace-nowrap">
                  {day(invoice.issueDate)}
                </td>
                <td className="py-2 pr-3">
                  {invoice.supplier.tradeName ?? invoice.supplier.legalName}
                </td>
                <td className="py-2 pr-3">
                  <Link
                    href={`/admin/purchases/${invoice.purchaseOrder.number}`}
                    className="hover:underline"
                  >
                    #{invoice.purchaseOrder.number}
                  </Link>
                </td>
                <td className="py-2 pr-3 whitespace-nowrap">
                  {invoice.dueDate ? day(invoice.dueDate) : "—"}
                </td>
                <td className="py-2 pr-3">
                  <InvoiceState state={invoice.state} label={i.states} />
                </td>
                <td className="py-2 text-right whitespace-nowrap">
                  {format.money(invoice.total)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
