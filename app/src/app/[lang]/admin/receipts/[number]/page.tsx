import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { DifferenceLabel } from "@/components/purchases/difference-label";
import { ReasonForm } from "@/components/purchases/receipt-forms";
import { interpolate } from "@/i18n/config";
import { formatters } from "@/i18n/format";
import { getLocale, getT } from "@/i18n/server";
import { getUserWithPermission } from "@/lib/auth";
import { parseSaleNumber } from "@/lib/checkout";
import {
  RECEIPT_NOTES_MAX_LENGTH,
  receiptDifference,
} from "@/lib/goods-receipt";
import { getGoodsReceipt } from "@/lib/purchase-queries";
import { annulGoodsReceipt } from "../actions";

export async function generateMetadata({
  params,
}: PageProps<"/[lang]/admin/receipts/[number]">): Promise<Metadata> {
  const t = await getT();
  return {
    title: interpolate(t.receipts.detailTitle, {
      number: (await params).number,
    }),
  };
}

export default async function ReceiptPage({
  params,
}: PageProps<"/[lang]/admin/receipts/[number]">) {
  const t = await getT();
  return (
    <main className="mx-auto w-full max-w-5xl p-4 sm:p-8">
      <Link href="/admin/receipts" className="text-sm hover:underline">
        ← {t.receipts.title}
      </Link>
      {/* params y el informe son de request: van en Suspense. */}
      <Suspense
        fallback={<p className="mt-6 text-sm opacity-70">{t.common.loading}</p>}
      >
        <Receipt params={params} />
      </Suspense>
    </main>
  );
}

async function Receipt({ params }: { params: Promise<{ number: string }> }) {
  await getUserWithPermission("purchases:manage");
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const format = formatters(locale);
  const r = t.receipts;
  const c = r.columns;

  const number = parseSaleNumber((await params).number);
  if (number === null) notFound();
  const receipt = await getGoodsReceipt(number);
  if (!receipt) notFound();
  const order = receipt.purchaseOrder;
  const fullName = (user: typeof receipt.createdBy) =>
    user ? `${user.person.name} ${user.person.surname}` : "—";
  const annulled = receipt.state === "ANNULLED";

  return (
    <>
      <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold">
          {interpolate(r.detailTitle, { number: receipt.number })}
        </h1>
        <span
          className={`rounded border border-current/20 px-2 py-0.5 text-sm ${annulled ? "text-red-600" : ""}`}
        >
          {r.states[receipt.state]}
        </span>
      </div>
      <dl className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
        <dt className="opacity-70">{c.order}</dt>
        <dd>
          <Link
            href={`/admin/purchases/${order.number}`}
            className="hover:underline"
          >
            #{order.number}
          </Link>{" "}
          · {order.supplier.tradeName ?? order.supplier.legalName}
        </dd>
        <dt className="opacity-70">{c.warehouse}</dt>
        <dd>{receipt.warehouse.name}</dd>
        <dt className="opacity-70">{c.deliveryNote}</dt>
        <dd className="font-mono">{receipt.deliveryNote ?? "—"}</dd>
        {receipt.notes && (
          <>
            <dt className="opacity-70">{r.notesOptional}</dt>
            <dd>{receipt.notes}</dd>
          </>
        )}
      </dl>
      <p className="mt-2 text-xs opacity-70">
        {interpolate(r.createdBy, {
          user: fullName(receipt.createdBy),
          date: format.dateTime(receipt.createdAt),
        })}
      </p>
      {annulled && receipt.annulledAt && (
        <p className="mt-2 text-sm text-red-600">
          {interpolate(r.annulled, {
            date: format.dateTime(receipt.annulledAt),
            user: fullName(receipt.annulledBy),
            reason: receipt.annulReason ?? "",
          })}
        </p>
      )}

      <div className="overflow-x-auto print:overflow-visible">
        <table className="mt-6 w-full text-left text-sm">
          <thead className="border-b border-current/20">
            <tr>
              <th className="py-2 pr-3 font-medium">{c.product}</th>
              <th className="py-2 pr-3 text-right font-medium">{c.pending}</th>
              <th className="py-2 pr-3 text-right font-medium">{c.quantity}</th>
              <th className="py-2 text-right font-medium">{c.difference}</th>
            </tr>
          </thead>
          <tbody>
            {receipt.items.map((item) => (
              <tr key={item.productId} className="border-b border-current/10">
                <td className="py-2 pr-3">
                  {item.product.name}
                  <span className="block font-mono text-xs opacity-70">
                    {item.product.sku}
                  </span>
                </td>
                <td className="py-2 pr-3 text-right whitespace-nowrap">
                  {format.number(item.pending)}{" "}
                  {item.product.measurementUnit.name}
                </td>
                <td className="py-2 pr-3 text-right whitespace-nowrap">
                  {format.number(item.quantity)}{" "}
                  {item.product.measurementUnit.name}
                </td>
                <td className="py-2 text-right whitespace-nowrap">
                  <DifferenceLabel
                    diff={receiptDifference(item.pending, item.quantity)}
                    t={r}
                    format={format}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!annulled && (
        <div className="mt-8">
          <ReasonForm
            action={annulGoodsReceipt.bind(null, receipt.id)}
            label={r.annul}
            hint={r.annulHint}
            reasonLabel={r.reason}
            pendingLabel={r.working}
            maxLength={RECEIPT_NOTES_MAX_LENGTH}
          />
        </div>
      )}
    </>
  );
}
