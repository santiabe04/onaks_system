import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PrintButton } from "@/components/ui/print-button";
import { interpolate } from "@/i18n/config";
import { formatters } from "@/i18n/format";
import { getLocale, getT } from "@/i18n/server";
import { APP_NAME } from "@/lib/app";
import { getUserWithPermission } from "@/lib/auth";
import { lineTotals } from "@/lib/cart";
import { parseSaleNumber } from "@/lib/checkout";
import { formatCuit } from "@/lib/cuit";
import { getPurchaseOrder } from "@/lib/purchase-queries";

export async function generateMetadata({
  params,
}: PageProps<"/[lang]/admin/purchases/[number]/print">): Promise<Metadata> {
  const t = await getT();
  return {
    title: interpolate(t.purchases.detailTitle, {
      number: (await params).number,
    }),
  };
}

// La OC para mandar al proveedor (imprimir o guardar como PDF desde el navegador).
export default async function PurchaseOrderPrintPage({
  params,
}: PageProps<"/[lang]/admin/purchases/[number]/print">) {
  const t = await getT();
  return (
    <main className="mx-auto w-full max-w-4xl p-8 print:p-0">
      {/* params y la orden son de request: van en Suspense. */}
      <Suspense
        fallback={<p className="text-sm opacity-70">{t.common.loading}</p>}
      >
        <PrintableOrder params={params} />
      </Suspense>
    </main>
  );
}

async function PrintableOrder({
  params,
}: {
  params: Promise<{ number: string }>;
}) {
  await getUserWithPermission("purchases:manage");
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const format = formatters(locale);
  const p = t.purchases;

  const number = parseSaleNumber((await params).number);
  if (number === null) notFound();
  const order = await getPurchaseOrder(number);
  if (!order) notFound();
  const supplier = order.supplier;
  const by = order.createdBy?.person;

  return (
    <>
      <div className="mb-4 flex gap-3 print:hidden">
        <PrintButton label={p.print} />
        <Link
          href={`/admin/purchases/${order.number}`}
          className="self-center text-sm hover:underline"
        >
          ← {interpolate(p.detailTitle, { number: order.number })}
        </Link>
      </div>

      <header className="flex flex-wrap justify-between gap-4 border-b border-current/30 pb-3">
        <div>
          <h1 className="text-xl font-semibold">
            {interpolate(p.detailTitle, { number: order.number })}
          </h1>
          <p className="text-sm">
            {format.date(order.sentAt ?? order.createdAt)} · {APP_NAME}
          </p>
          {order.expectedDate && (
            <p className="text-sm">
              {p.expected}:{" "}
              {format.date(
                new Date(
                  `${order.expectedDate.toISOString().slice(0, 10)}T12:00:00-03:00`,
                ),
              )}
            </p>
          )}
        </div>
        <div className="text-sm">
          <p className="font-medium">{p.print_.supplierData}</p>
          <p>{supplier.legalName}</p>
          <p>
            {interpolate(p.print_.cuit, { cuit: formatCuit(supplier.cuit) })}
          </p>
          {supplier.contactName && <p>{supplier.contactName}</p>}
          {(supplier.contactPhone || supplier.contactMail) && (
            <p>
              {[supplier.contactPhone, supplier.contactMail]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
        </div>
      </header>

      <table className="mt-4 w-full text-left text-sm">
        <thead className="border-b border-current/30">
          <tr>
            <th className="py-2 pr-3 font-medium">{p.columns.code}</th>
            <th className="py-2 pr-3 font-medium">{p.columns.product}</th>
            <th className="py-2 pr-3 text-right font-medium">
              {p.columns.quantity}
            </th>
            <th className="py-2 pr-3 text-right font-medium">
              {p.columns.unitCost}
            </th>
            <th className="py-2 text-right font-medium">
              {p.columns.lineTotal}
            </th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((item) => (
            <tr key={item.productId} className="border-b border-current/10">
              <td className="py-1 pr-3 font-mono text-xs">
                {item.product.suppliers.find(
                  (link) => link.supplierId === supplier.id,
                )?.supplierCode ?? "—"}
              </td>
              <td className="py-1 pr-3">{item.product.name}</td>
              <td className="py-1 pr-3 text-right whitespace-nowrap">
                {format.number(item.quantity)}{" "}
                {item.product.measurementUnit.name}
              </td>
              <td className="py-1 pr-3 text-right whitespace-nowrap">
                {format.money(item.unitCost)}
              </td>
              <td className="py-1 text-right whitespace-nowrap">
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
          ))}
        </tbody>
      </table>

      <dl className="mt-4 ml-auto flex w-full max-w-xs flex-col gap-1 text-sm">
        <div className="flex justify-between">
          <dt>{p.net}</dt>
          <dd>{format.money(order.subTotal)}</dd>
        </div>
        <div className="flex justify-between">
          <dt>{p.tax}</dt>
          <dd>{format.money(order.tax)}</dd>
        </div>
        <div className="flex justify-between border-t border-current/30 pt-1 font-semibold">
          <dt>{p.total}</dt>
          <dd>{format.money(order.total)}</dd>
        </div>
      </dl>

      {order.notes && <p className="mt-4 text-sm">{order.notes}</p>}
      <footer className="mt-10 flex justify-between gap-8 text-xs">
        <p>
          {p.print_.buyer}: {by ? `${by.name} ${by.surname}` : APP_NAME}
        </p>
        <p className="w-56 border-t border-current/50 pt-1">
          {p.print_.signature}
        </p>
      </footer>
    </>
  );
}
