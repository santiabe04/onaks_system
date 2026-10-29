import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { formatters } from "@/i18n/format";
import { getLocale, getT } from "@/i18n/server";
import { fromCents, toCents } from "@/lib/account";
import { getUserWithPermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { loadSupplierAccount } from "@/lib/supplier-account-ledger";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.supplierAccount.debtsTitle };
}

export default async function SupplierDebtsPage() {
  const t = await getT();
  return (
    <main className="mx-auto w-full max-w-5xl p-4 sm:p-8">
      <h1 className="text-2xl font-semibold">{t.supplierAccount.debtsTitle}</h1>
      {/* Las cuentas salen de la DB y dependen de hoy: van en Suspense. */}
      <Suspense
        fallback={<p className="mt-6 text-sm opacity-70">{t.common.loading}</p>}
      >
        <Debts />
      </Suspense>
    </main>
  );
}

const COLUMNS = [
  "balance",
  "overdue",
  "dueSoon",
  "unallocated",
  "flagged",
] as const;

async function Debts() {
  await getUserWithPermission("purchases:manage");
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const format = formatters(locale);
  const a = t.supplierAccount;

  await connection();
  // Solo los proveedores con algún comprobante; son pocos, se arma cada cuenta.
  const suppliers = await db.supplier.findMany({
    where: {
      OR: [
        { invoices: { some: {} } },
        { payments: { some: {} } },
        { creditNotes: { some: {} } },
      ],
    },
    orderBy: { legalName: "asc" },
    select: { id: true, legalName: true, tradeName: true },
  });
  const rows = (
    await Promise.all(
      suppliers.map(async (supplier) => ({
        supplier,
        summary: (await loadSupplierAccount(db, supplier.id)).summary,
      })),
    )
  )
    .filter(({ summary }) =>
      COLUMNS.some((column) => toCents(summary[column]) !== BigInt(0)),
    )
    // Primero lo vencido, después la deuda más grande.
    .sort(
      (x, y) =>
        Number(toCents(y.summary.overdue) - toCents(x.summary.overdue)) ||
        Number(toCents(y.summary.balance) - toCents(x.summary.balance)),
    );

  if (rows.length === 0) {
    return <p className="mt-6 text-sm opacity-70">{a.debtsEmpty}</p>;
  }
  const total = (column: (typeof COLUMNS)[number]) =>
    fromCents(
      rows.reduce((sum, row) => sum + toCents(row.summary[column]), BigInt(0)),
    );
  const cell = (value: string, highlight?: boolean) =>
    toCents(value) === BigInt(0) ? (
      <span className="opacity-40">—</span>
    ) : (
      <span className={highlight ? "font-semibold text-red-600" : ""}>
        {format.money(value)}
      </span>
    );

  return (
    <div className="overflow-x-auto print:overflow-visible">
      <table className="mt-6 w-full text-left text-sm">
        <thead className="border-b border-current/20">
          <tr>
            <th className="py-2 pr-3 font-medium">{a.debtsColumns.supplier}</th>
            {COLUMNS.map((column) => (
              <th key={column} className="py-2 pr-3 text-right font-medium">
                {a.debtsColumns[column]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ supplier, summary }) => (
            <tr key={supplier.id} className="border-b border-current/10">
              <td className="py-2 pr-3">
                <Link
                  href={`/admin/suppliers/${supplier.id}/account`}
                  className="font-medium hover:underline"
                >
                  {supplier.tradeName ?? supplier.legalName}
                </Link>
              </td>
              {COLUMNS.map((column) => (
                <td
                  key={column}
                  className="py-2 pr-3 text-right whitespace-nowrap"
                >
                  {cell(summary[column], column === "overdue")}
                </td>
              ))}
            </tr>
          ))}
          <tr className="font-semibold">
            <td className="py-2 pr-3">{a.totalRow}</td>
            {COLUMNS.map((column) => (
              <td
                key={column}
                className="py-2 pr-3 text-right whitespace-nowrap"
              >
                {cell(total(column), column === "overdue")}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
