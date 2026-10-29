import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { formatDay } from "@/components/purchases/open-invoice-rows";
import { SupplierBalance } from "@/components/purchases/supplier-balance";
import { buttonClass } from "@/components/ui/button";
import { interpolate } from "@/i18n/config";
import { formatters } from "@/i18n/format";
import { getLocale, getT } from "@/i18n/server";
import { fromCents, toCents } from "@/lib/account";
import { getUserWithPermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { isCuid } from "@/lib/ids";
import {
  loadSupplierAccount,
  openInvoices,
} from "@/lib/supplier-account-ledger";
import { formatInvoiceNumber } from "@/lib/supplier-invoice";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.supplierAccount.title };
}

export default async function SupplierAccountPage({
  params,
}: PageProps<"/[lang]/admin/suppliers/[id]/account">) {
  const t = await getT();
  return (
    <main className="mx-auto w-full max-w-5xl p-4 sm:p-8">
      {/* params y la cuenta son de request: van en Suspense. */}
      <Suspense
        fallback={<p className="text-sm opacity-70">{t.common.loading}</p>}
      >
        <Account params={params} />
      </Suspense>
    </main>
  );
}

type Row = {
  key: string;
  day: string;
  order: number;
  concept: string;
  href: string;
  /** Centavos: positivo suma deuda, negativo la baja; 0 si no cuenta. */
  amount: bigint;
  tag?: string;
  struck?: boolean;
};

async function Account({ params }: { params: Promise<{ id: string }> }) {
  await getUserWithPermission("purchases:manage");
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const format = formatters(locale);
  const a = t.supplierAccount;
  const c = a.columns;

  const { id } = await params;
  if (!isCuid(id)) notFound();
  const supplier = await db.supplier.findUnique({
    where: { id },
    select: { id: true, legalName: true, tradeName: true },
  });
  if (!supplier) notFound();
  const name = supplier.tradeName ?? supplier.legalName;

  // Vencido y por vencer dependen de hoy.
  await connection();
  const account = await loadSupplierAccount(db, supplier.id);
  const { summary } = account;
  const open = openInvoices(account);

  // Facturas aprobadas suman; OP y notas de crédito restan; lo anulado y lo
  // observado se muestra pero no cuenta.
  const rows: Row[] = [
    ...account.invoices.map((invoice) => ({
      key: `i-${invoice.id}`,
      day: invoice.issueDate.toISOString().slice(0, 10),
      order: invoice.createdAt.getTime(),
      concept: interpolate(a.concepts.invoice, {
        number: formatInvoiceNumber(invoice),
      }),
      href: `/admin/invoices/${invoice.id}`,
      amount: invoice.state === "APPROVED" ? toCents(invoice.total) : BigInt(0),
      tag:
        invoice.state === "FLAGGED"
          ? `${a.flaggedTag} · ${format.money(invoice.total)}`
          : invoice.state === "ANNULLED"
            ? a.annulled
            : undefined,
      struck: invoice.state === "ANNULLED",
    })),
    ...account.payments.map((payment) => ({
      key: `p-${payment.id}`,
      day: payment.paidOn.toISOString().slice(0, 10),
      order: payment.createdAt.getTime(),
      concept: interpolate(a.concepts.payment, { number: payment.number }),
      href: `/admin/supplier-payments/${payment.number}`,
      amount: payment.annulledAt ? BigInt(0) : -toCents(payment.total),
      tag: payment.annulledAt ? a.annulled : undefined,
      struck: payment.annulledAt !== null,
    })),
    ...account.creditNotes.map((note) => ({
      key: `c-${note.id}`,
      day: note.issueDate.toISOString().slice(0, 10),
      order: note.createdAt.getTime(),
      concept: interpolate(a.concepts.creditNote, {
        number: formatInvoiceNumber(note),
      }),
      href: `/admin/credit-notes/${note.id}`,
      amount: note.annulledAt ? BigInt(0) : -toCents(note.total),
      tag: note.annulledAt ? a.annulled : undefined,
      struck: note.annulledAt !== null,
    })),
  ].sort((x, y) => x.day.localeCompare(y.day) || x.order - y.order);
  // Saldo acumulado fila por fila.
  const withBalance = rows.reduce<(Row & { balance: bigint })[]>(
    (acc, row) => [
      ...acc,
      { ...row, balance: (acc.at(-1)?.balance ?? BigInt(0)) + row.amount },
    ],
    [],
  );

  const extras = [
    toCents(summary.overdue) > BigInt(0) &&
      interpolate(a.overdue, { amount: format.money(summary.overdue) }),
    toCents(summary.dueSoon) > BigInt(0) &&
      interpolate(a.dueSoon, { amount: format.money(summary.dueSoon) }),
    toCents(summary.unallocated) > BigInt(0) &&
      interpolate(a.unallocated, {
        amount: format.money(summary.unallocated),
      }),
    toCents(summary.flagged) > BigInt(0) &&
      interpolate(a.flagged, { amount: format.money(summary.flagged) }),
  ].filter(Boolean);

  return (
    <>
      <Link
        href={`/admin/suppliers/${supplier.id}`}
        className="text-sm hover:underline"
      >
        ← {name}
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">
        {interpolate(a.of, { supplier: name })}
      </h1>

      <section className="mt-6 flex flex-wrap items-start justify-between gap-4 rounded border border-current/20 p-4">
        <div>
          <SupplierBalance
            balance={summary.balance}
            t={a}
            format={format}
            large
          />
          {extras.length > 0 && (
            <p className="mt-1 flex flex-wrap gap-x-4 text-sm opacity-80">
              {extras.map((extra) => (
                <span key={String(extra)}>{extra}</span>
              ))}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            href={`/admin/supplier-payments/new?supplier=${supplier.id}`}
            className={buttonClass()}
          >
            {a.newPayment}
          </Link>
          <Link
            href={`/admin/credit-notes/new?supplier=${supplier.id}`}
            className={buttonClass("secondary")}
          >
            {a.newCreditNote}
          </Link>
        </div>
      </section>

      <h2 className="mt-8 text-lg font-medium">{a.openInvoices}</h2>
      {open.length === 0 ? (
        <p className="mt-2 text-sm opacity-70">{a.noOpenInvoices}</p>
      ) : (
        <div className="overflow-x-auto print:overflow-visible">
          <table className="mt-3 w-full text-left text-sm">
            <thead className="border-b border-current/20">
              <tr>
                <th className="py-2 pr-3 font-medium">{c.invoice}</th>
                <th className="py-2 pr-3 font-medium">{c.due}</th>
                <th className="py-2 pr-3 text-right font-medium">{c.total}</th>
                <th className="py-2 pr-3 text-right font-medium">{c.paid}</th>
                <th className="py-2 text-right font-medium">{c.outstanding}</th>
              </tr>
            </thead>
            <tbody>
              {open.map((row) => (
                <tr key={row.id} className="border-b border-current/10">
                  <td className="py-2 pr-3 whitespace-nowrap">
                    <Link
                      href={`/admin/invoices/${row.id}`}
                      className="font-mono hover:underline"
                    >
                      {formatInvoiceNumber(row.invoice)}
                    </Link>
                  </td>
                  <td
                    className={`py-2 pr-3 whitespace-nowrap ${row.overdue ? "text-red-600" : ""}`}
                  >
                    {formatDay(format, row.dueOn)}
                    {row.overdue && ` · ${a.overdueTag}`}
                  </td>
                  <td className="py-2 pr-3 text-right whitespace-nowrap">
                    {format.money(row.invoice.total)}
                  </td>
                  <td className="py-2 pr-3 text-right whitespace-nowrap">
                    {format.money(row.paid)}
                  </td>
                  <td className="py-2 text-right font-semibold whitespace-nowrap">
                    {format.money(row.outstanding)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="mt-8 text-lg font-medium">{a.movements}</h2>
      {withBalance.length === 0 ? (
        <p className="mt-2 text-sm opacity-70">{a.noMovements}</p>
      ) : (
        <div className="overflow-x-auto print:overflow-visible">
          <table className="mt-3 w-full text-left text-sm">
            <thead className="border-b border-current/20">
              <tr>
                <th className="py-2 pr-3 font-medium">{c.date}</th>
                <th className="py-2 pr-3 font-medium">{c.concept}</th>
                <th className="py-2 pr-3 text-right font-medium">{c.charge}</th>
                <th className="py-2 pr-3 text-right font-medium">{c.credit}</th>
                <th className="py-2 text-right font-medium">{c.balance}</th>
              </tr>
            </thead>
            <tbody>
              {withBalance.map((row) => (
                <tr key={row.key} className="border-b border-current/10">
                  <td className="py-2 pr-3 whitespace-nowrap">
                    {formatDay(format, row.day)}
                  </td>
                  <td className="py-2 pr-3">
                    <Link
                      href={row.href}
                      className={`hover:underline ${row.struck ? "line-through opacity-60" : ""}`}
                    >
                      {row.concept}
                    </Link>
                    {row.tag && (
                      <span className="ml-2 text-xs text-amber-700 dark:text-amber-400">
                        {row.tag}
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-right whitespace-nowrap">
                    {row.amount > BigInt(0)
                      ? format.money(fromCents(row.amount))
                      : ""}
                  </td>
                  <td className="py-2 pr-3 text-right whitespace-nowrap">
                    {row.amount < BigInt(0)
                      ? format.money(fromCents(-row.amount))
                      : ""}
                  </td>
                  <td className="py-2 text-right whitespace-nowrap">
                    {format.money(fromCents(row.balance))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
