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
import { ReasonForm } from "@/components/purchases/receipt-forms";
import { interpolate } from "@/i18n/config";
import { formatters } from "@/i18n/format";
import { getLocale, getT } from "@/i18n/server";
import { toCents } from "@/lib/account";
import { getUserWithPermission } from "@/lib/auth";
import { formatCuit } from "@/lib/cuit";
import { db } from "@/lib/db";
import { isCuid } from "@/lib/ids";
import { getCreditNote } from "@/lib/purchase-queries";
import {
  PAYMENT_NOTES_MAX_LENGTH,
  unallocatedOf,
} from "@/lib/supplier-account";
import { loadSupplierAccount } from "@/lib/supplier-account-ledger";
import { formatInvoiceNumber } from "@/lib/supplier-invoice";
import { allocateCreditNote, annulCreditNote } from "../actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.creditNotes.title };
}

export default async function CreditNotePage({
  params,
}: PageProps<"/[lang]/admin/credit-notes/[id]">) {
  const t = await getT();
  return (
    <main className="mx-auto w-full max-w-5xl p-8">
      {/* params y la nota son de request: van en Suspense. */}
      <Suspense
        fallback={<p className="text-sm opacity-70">{t.common.loading}</p>}
      >
        <CreditNote params={params} />
      </Suspense>
    </main>
  );
}

async function CreditNote({ params }: { params: Promise<{ id: string }> }) {
  await getUserWithPermission("purchases:manage");
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const format = formatters(locale);
  const n = t.creditNotes;
  const p = t.supplierPayments;

  const { id } = await params;
  if (!isCuid(id)) notFound();
  const note = await getCreditNote(id);
  if (!note) notFound();
  const supplierName = note.supplier.tradeName ?? note.supplier.legalName;
  const fullName = (user: typeof note.createdBy) =>
    user ? `${user.person.name} ${user.person.surname}` : "—";
  const annulled = note.annulledAt !== null;
  const available = unallocatedOf({
    total: note.total,
    annulled,
    allocations: note.allocations,
  });

  await connection();
  const openRows =
    toCents(available) > BigInt(0)
      ? openInvoiceRows(await loadSupplierAccount(db, note.supplierId), format)
      : [];

  return (
    <>
      <Link
        href={`/admin/suppliers/${note.supplier.id}/account`}
        className="text-sm hover:underline"
      >
        ← {interpolate(t.supplierAccount.of, { supplier: supplierName })}
      </Link>
      <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold">
          {interpolate(n.detailTitle, { number: formatInvoiceNumber(note) })}
        </h1>
        {annulled && (
          <span className="rounded border border-current/20 px-2 py-0.5 text-sm text-red-600">
            {p.states.annulled}
          </span>
        )}
      </div>
      <p className="mt-1 text-sm">
        {supplierName} · CUIT {formatCuit(note.supplier.cuit)} · {n.issueDate}:{" "}
        {formatDay(format, note.issueDate)}
      </p>
      {note.invoice && (
        <p className="text-sm">
          {n.invoice}:{" "}
          <Link
            href={`/admin/invoices/${note.invoice.id}`}
            className="font-mono hover:underline"
          >
            {formatInvoiceNumber(note.invoice)}
          </Link>
        </p>
      )}
      {note.notes && <p className="mt-1 text-sm">{note.notes}</p>}
      <p className="mt-1 text-xs opacity-70">
        {interpolate(n.createdBy, {
          user: fullName(note.createdBy),
          date: format.dateTime(note.createdAt),
        })}
      </p>
      {annulled && note.annulledAt && (
        <p className="mt-2 text-sm text-red-600">
          {interpolate(n.annulled, {
            date: format.dateTime(note.annulledAt),
            user: fullName(note.annulledBy),
            reason: note.annulReason ?? "",
          })}
        </p>
      )}

      <dl className="mt-4 flex w-full max-w-xs flex-col gap-1 text-sm">
        <div className="flex justify-between">
          <dt className="opacity-70">{n.subTotal}</dt>
          <dd>{format.money(note.subTotal)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="opacity-70">{n.tax}</dt>
          <dd>{format.money(note.tax)}</dd>
        </div>
        <div className="flex justify-between border-t border-current/20 pt-1 font-semibold">
          <dt>{n.total}</dt>
          <dd>{format.money(note.total)}</dd>
        </div>
      </dl>

      <h2 className="mt-6 mb-2 text-lg font-medium">{p.allocationsTitle}</h2>
      <AllocationList allocations={note.allocations} t={p} format={format} />
      {toCents(available) > BigInt(0) && (
        <p className="mt-2 text-sm">
          {p.onAccount}: {format.money(available)}
        </p>
      )}

      <div className="mt-8 flex flex-col gap-4">
        {openRows.length > 0 && (
          <AllocateForm
            action={allocateCreditNote.bind(null, note.id)}
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
            action={annulCreditNote.bind(null, note.id)}
            label={n.annul}
            hint={n.annulHint}
            reasonLabel={n.reason}
            pendingLabel={n.working}
            maxLength={PAYMENT_NOTES_MAX_LENGTH}
          />
        )}
      </div>
    </>
  );
}
