import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { InvoiceState } from "@/components/purchases/invoice-state";
import { ReasonForm } from "@/components/purchases/receipt-forms";
import { interpolate } from "@/i18n/config";
import { formatters } from "@/i18n/format";
import { getLocale, getT } from "@/i18n/server";
import { getUserWithPermission } from "@/lib/auth";
import { lineTotals } from "@/lib/cart";
import { formatCuit } from "@/lib/cuit";
import { isCuid } from "@/lib/ids";
import { getSupplierInvoice } from "@/lib/purchase-queries";
import { toMilli } from "@/lib/quantity";
import {
  formatInvoiceNumber,
  INVOICE_NOTES_MAX_LENGTH,
  type MatchDifference,
} from "@/lib/supplier-invoice";
import { annulSupplierInvoice, approveSupplierInvoice } from "../actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.invoices.title };
}

export default async function InvoicePage({
  params,
}: PageProps<"/[lang]/admin/invoices/[id]">) {
  const t = await getT();
  return (
    <main className="mx-auto w-full max-w-5xl p-8">
      <Link href="/admin/invoices" className="text-sm hover:underline">
        ← {t.invoices.title}
      </Link>
      {/* params y la factura son de request: van en Suspense. */}
      <Suspense
        fallback={<p className="mt-6 text-sm opacity-70">{t.common.loading}</p>}
      >
        <Invoice params={params} />
      </Suspense>
    </main>
  );
}

async function Invoice({ params }: { params: Promise<{ id: string }> }) {
  await getUserWithPermission("purchases:manage");
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const format = formatters(locale);
  const i = t.invoices;
  const c = i.columns;

  const { id } = await params;
  if (!isCuid(id)) notFound();
  const invoice = await getSupplierInvoice(id);
  if (!invoice) notFound();

  const order = invoice.purchaseOrder;
  const fullName = (user: typeof invoice.createdBy) =>
    user ? `${user.person.name} ${user.person.surname}` : "—";
  const day = (date: Date) =>
    format.date(new Date(`${date.toISOString().slice(0, 10)}T12:00:00-03:00`));
  const productName = (productId: string) =>
    invoice.items.find((item) => item.productId === productId)?.product.name ??
    productId;
  const differences = invoice.differences as MatchDifference[];
  const describe = (difference: MatchDifference) =>
    difference.kind === "TOTAL"
      ? interpolate(i.differences.TOTAL, {
          expected: format.money(difference.expected),
          actual: format.money(difference.actual),
        })
      : interpolate(i.differences[difference.kind], {
          product: productName(difference.productId),
          expected:
            difference.kind === "PRICE"
              ? format.money(difference.expected)
              : format.number(difference.expected),
          actual:
            difference.kind === "PRICE"
              ? format.money(difference.actual)
              : format.number(difference.actual),
        });
  const taxes = [
    [i.vatPerception, invoice.vatPerception],
    [i.iibbPerception, invoice.iibbPerception],
    [i.otherTaxes, invoice.otherTaxes],
  ] as const;

  return (
    <>
      <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold">
          {interpolate(i.detailTitle, { number: formatInvoiceNumber(invoice) })}
        </h1>
        <span className="rounded border border-current/20 px-2 py-0.5 text-sm">
          <InvoiceState state={invoice.state} label={i.states} />
        </span>
      </div>
      <p className="mt-1 text-sm">
        {invoice.supplier.tradeName ?? invoice.supplier.legalName} · CUIT{" "}
        {formatCuit(invoice.supplier.cuit)} ·{" "}
        <Link
          href={`/admin/purchases/${order.number}`}
          className="hover:underline"
        >
          {c.order} #{order.number}
        </Link>
      </p>
      <p className="text-sm">
        {c.date}: {day(invoice.issueDate)}
        {invoice.dueDate && ` · ${i.due}: ${day(invoice.dueDate)}`}
      </p>
      {invoice.notes && <p className="mt-1 text-sm">{invoice.notes}</p>}
      <p className="mt-1 text-xs opacity-70">
        {interpolate(i.createdBy, {
          user: fullName(invoice.createdBy),
          date: format.dateTime(invoice.createdAt),
        })}
      </p>

      <section className="mt-4 rounded border border-current/20 p-3 text-sm">
        <h2 className="mb-1 font-medium">{i.differencesTitle}</h2>
        {differences.length === 0 ? (
          <p className="text-green-700 dark:text-green-400">
            {i.noDifferences}
          </p>
        ) : (
          <ul className="list-inside list-disc text-amber-700 dark:text-amber-400">
            {differences.map((difference, index) => (
              <li key={index}>{describe(difference)}</li>
            ))}
          </ul>
        )}
        {invoice.approvalNote && invoice.approvedAt && (
          <p className="mt-2 text-xs">
            {interpolate(i.approved, {
              user: fullName(invoice.approvedBy),
              date: format.dateTime(invoice.approvedAt),
              note: invoice.approvalNote,
            })}
          </p>
        )}
      </section>
      {invoice.state === "ANNULLED" && invoice.annulledAt && (
        <p className="mt-3 text-sm text-red-600">
          {interpolate(i.annulled, {
            date: format.dateTime(invoice.annulledAt),
            user: fullName(invoice.annulledBy),
            reason: invoice.annulReason ?? "",
          })}
        </p>
      )}

      <table className="mt-6 w-full text-left text-sm">
        <thead className="border-b border-current/20">
          <tr>
            <th className="py-2 pr-3 font-medium">{c.product}</th>
            <th className="py-2 pr-3 text-right font-medium">{c.quantity}</th>
            <th className="py-2 pr-3 text-right font-medium">{c.unitCost}</th>
            <th className="py-2 pr-3 text-right font-medium">{c.orderCost}</th>
            <th className="py-2 text-right font-medium">{c.lineTotal}</th>
          </tr>
        </thead>
        <tbody>
          {invoice.items.map((item) => {
            const orderCost = order.items.find(
              (line) => line.productId === item.productId,
            )?.unitCost;
            return (
              <tr key={item.productId} className="border-b border-current/10">
                <td className="py-2 pr-3">
                  {item.product.name}
                  <span className="block font-mono text-xs opacity-70">
                    {item.product.sku}
                  </span>
                </td>
                <td className="py-2 pr-3 text-right whitespace-nowrap">
                  {format.number(item.quantity)}{" "}
                  {item.product.measurementUnit.name}
                </td>
                <td className="py-2 pr-3 text-right whitespace-nowrap">
                  {format.money(item.unitCost)}
                </td>
                <td className="py-2 pr-3 text-right whitespace-nowrap opacity-70">
                  {orderCost !== undefined ? format.money(orderCost) : "—"}
                </td>
                <td className="py-2 text-right whitespace-nowrap">
                  {format.money(
                    lineTotals({
                      price: item.unitCost,
                      rate: item.taxRate,
                      quantity: item.quantity,
                      weight: "0",
                    }).net,
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <dl className="mt-4 ml-auto flex w-full max-w-xs flex-col gap-1 text-sm">
        <div className="flex justify-between">
          <dt className="opacity-70">{i.net}</dt>
          <dd>{format.money(invoice.subTotal)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="opacity-70">{i.tax}</dt>
          <dd>{format.money(invoice.tax)}</dd>
        </div>
        {taxes
          .filter(([, amount]) => toMilli(amount) > BigInt(0))
          .map(([label, amount]) => (
            <div key={label} className="flex justify-between">
              <dt className="opacity-70">{label}</dt>
              <dd>{format.money(amount)}</dd>
            </div>
          ))}
        <div className="flex justify-between border-t border-current/20 pt-1 font-semibold">
          <dt>{i.total}</dt>
          <dd>{format.money(invoice.total)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="opacity-70">{i.printedTotal}</dt>
          <dd>{format.money(invoice.printedTotal)}</dd>
        </div>
      </dl>

      <div className="mt-8 flex flex-col gap-4">
        {invoice.state === "FLAGGED" && (
          <ReasonForm
            action={approveSupplierInvoice.bind(null, invoice.id)}
            label={i.approve}
            hint={i.approveHint}
            reasonLabel={i.approvalNote}
            pendingLabel={i.working}
            maxLength={INVOICE_NOTES_MAX_LENGTH}
            tone="neutral"
          />
        )}
        {invoice.state !== "ANNULLED" && (
          <ReasonForm
            action={annulSupplierInvoice.bind(null, invoice.id)}
            label={i.annul}
            hint={i.annulHint}
            reasonLabel={i.reason}
            pendingLabel={i.working}
            maxLength={INVOICE_NOTES_MAX_LENGTH}
          />
        )}
      </div>
    </>
  );
}
