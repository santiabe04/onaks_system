import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { InvoiceForm } from "@/components/purchases/invoice-forms";
import { interpolate } from "@/i18n/config";
import { formatters } from "@/i18n/format";
import { getLocale, getT } from "@/i18n/server";
import { getUserWithPermission } from "@/lib/auth";
import { parseSaleNumber } from "@/lib/checkout";
import { isoDay } from "@/lib/order-period";
import { getPurchaseOrder } from "@/lib/purchase-queries";
import { toMilli } from "@/lib/quantity";
import { invoicedQuantities, pendingToInvoice } from "@/lib/supplier-invoice";

export async function generateMetadata({
  params,
}: PageProps<"/[lang]/admin/purchases/[number]/invoice">): Promise<Metadata> {
  const t = await getT();
  return {
    title: interpolate(t.invoices.newTitle, { number: (await params).number }),
  };
}

export default async function NewInvoicePage({
  params,
}: PageProps<"/[lang]/admin/purchases/[number]/invoice">) {
  const t = await getT();
  return (
    <main className="mx-auto w-full max-w-6xl p-4 sm:p-8">
      {/* params y la orden son de request: van en Suspense. */}
      <Suspense
        fallback={<p className="text-sm opacity-70">{t.common.loading}</p>}
      >
        <NewInvoice params={params} />
      </Suspense>
    </main>
  );
}

async function NewInvoice({ params }: { params: Promise<{ number: string }> }) {
  await getUserWithPermission("purchases:manage");
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const format = formatters(locale);

  const number = parseSaleNumber((await params).number);
  if (number === null) notFound();
  const order = await getPurchaseOrder(number);
  if (!order) notFound();
  await connection();

  const invoiced = invoicedQuantities(order.invoices);
  const received = order.items.filter(
    (item) => toMilli(item.receivedQuantity) > BigInt(0),
  );

  return (
    <>
      <Link
        href={`/admin/purchases/${order.number}`}
        className="text-sm hover:underline"
      >
        ← {interpolate(t.purchases.detailTitle, { number: order.number })}
      </Link>
      <h1 className="mt-4 text-2xl font-semibold">
        {interpolate(t.invoices.newTitle, { number: order.number })}
      </h1>
      <p className="mt-1 mb-6 text-sm">
        {order.supplier.tradeName ?? order.supplier.legalName}
      </p>
      {received.length === 0 ? (
        <p className="text-sm opacity-70">{t.invoices.errors.notInvoiceable}</p>
      ) : (
        <InvoiceForm
          orderId={order.id}
          today={isoDay(new Date())}
          locale={locale}
          lines={received.map((item) => {
            const before = invoiced.get(item.productId) ?? "0";
            const pending = pendingToInvoice(item.receivedQuantity, before);
            return {
              productId: item.productId,
              name: item.product.name,
              sku: item.product.sku,
              unit: item.product.measurementUnit.name,
              allowsDecimals: item.product.measurementUnit.allowsDecimals,
              taxRate: item.taxRate.toString(),
              received: format.number(item.receivedQuantity),
              invoicedBefore: format.number(before),
              pending: format.number(pending),
              orderCost: format.money(item.unitCost),
              // Se precarga lo que falta facturar al costo de la OC.
              quantity:
                toMilli(pending) > BigInt(0) ? format.input(pending) : "",
              unitCost: format.input(item.unitCost),
            };
          })}
          t={t.invoices}
        />
      )}
    </>
  );
}
