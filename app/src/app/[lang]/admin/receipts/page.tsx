import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { formatters } from "@/i18n/format";
import { getLocale, getT } from "@/i18n/server";
import { getUserWithPermission } from "@/lib/auth";
import { db } from "@/lib/db";

const PATH = "/admin/receipts";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.receipts.title };
}

export default async function ReceiptsPage() {
  const t = await getT();
  return (
    <main className="mx-auto w-full max-w-5xl p-4 sm:p-8">
      <h1 className="text-2xl font-semibold">{t.receipts.title}</h1>
      {/* Los informes salen de la DB: van en Suspense. */}
      <Suspense
        fallback={<p className="mt-6 text-sm opacity-70">{t.common.loading}</p>}
      >
        <Receipts />
      </Suspense>
    </main>
  );
}

async function Receipts() {
  await getUserWithPermission("purchases:manage");
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const format = formatters(locale);
  const r = t.receipts;
  const c = r.columns;

  const receipts = await db.goodsReceipt.findMany({
    orderBy: { number: "desc" },
    take: 100,
    select: {
      number: true,
      createdAt: true,
      deliveryNote: true,
      state: true,
      warehouse: { select: { name: true } },
      purchaseOrder: {
        select: {
          number: true,
          supplier: { select: { legalName: true, tradeName: true } },
        },
      },
    },
  });

  if (receipts.length === 0) {
    return <p className="mt-6 text-sm opacity-70">{r.empty}</p>;
  }
  return (
    <div className="overflow-x-auto print:overflow-visible">
      <table className="mt-6 w-full text-left text-sm">
        <thead className="border-b border-current/20">
          <tr>
            <th className="py-2 pr-3 font-medium">{c.number}</th>
            <th className="py-2 pr-3 font-medium">{c.date}</th>
            <th className="py-2 pr-3 font-medium">{c.order}</th>
            <th className="py-2 pr-3 font-medium">{c.supplier}</th>
            <th className="py-2 pr-3 font-medium">{c.warehouse}</th>
            <th className="py-2 pr-3 font-medium">{c.deliveryNote}</th>
            <th className="py-2 font-medium">{c.state}</th>
          </tr>
        </thead>
        <tbody>
          {receipts.map((receipt) => (
            <tr key={receipt.number} className="border-b border-current/10">
              <td className="py-2 pr-3">
                <Link
                  href={`${PATH}/${receipt.number}`}
                  className="font-medium hover:underline"
                >
                  #{receipt.number}
                </Link>
              </td>
              <td className="py-2 pr-3 whitespace-nowrap">
                {format.date(receipt.createdAt)}
              </td>
              <td className="py-2 pr-3">
                <Link
                  href={`/admin/purchases/${receipt.purchaseOrder.number}`}
                  className="hover:underline"
                >
                  #{receipt.purchaseOrder.number}
                </Link>
              </td>
              <td className="py-2 pr-3">
                {receipt.purchaseOrder.supplier.tradeName ??
                  receipt.purchaseOrder.supplier.legalName}
              </td>
              <td className="py-2 pr-3">{receipt.warehouse.name}</td>
              <td className="py-2 pr-3 font-mono text-xs">
                {receipt.deliveryNote ?? "—"}
              </td>
              <td
                className={`py-2 ${receipt.state === "ANNULLED" ? "text-red-600" : ""}`}
              >
                {r.states[receipt.state]}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
