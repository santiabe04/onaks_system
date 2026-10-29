import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ReceiptForm } from "@/components/purchases/receipt-forms";
import { interpolate } from "@/i18n/config";
import { formatters } from "@/i18n/format";
import { getLocale, getT } from "@/i18n/server";
import { getUserWithPermission } from "@/lib/auth";
import { parseSaleNumber } from "@/lib/checkout";
import { db } from "@/lib/db";
import { pendingQuantity, RECEIVABLE_PO_STATES } from "@/lib/goods-receipt";
import { getPurchaseOrder } from "@/lib/purchase-queries";
import { toMilli } from "@/lib/quantity";

export async function generateMetadata({
  params,
}: PageProps<"/[lang]/admin/purchases/[number]/receive">): Promise<Metadata> {
  const t = await getT();
  return {
    title: interpolate(t.receipts.newTitle, { number: (await params).number }),
  };
}

export default async function ReceivePage({
  params,
}: PageProps<"/[lang]/admin/purchases/[number]/receive">) {
  const t = await getT();
  return (
    <main className="mx-auto w-full max-w-5xl p-8">
      {/* params y la orden son de request: van en Suspense. */}
      <Suspense
        fallback={<p className="text-sm opacity-70">{t.common.loading}</p>}
      >
        <Receive params={params} />
      </Suspense>
    </main>
  );
}

async function Receive({ params }: { params: Promise<{ number: string }> }) {
  await getUserWithPermission("purchases:manage");
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const format = formatters(locale);

  const number = parseSaleNumber((await params).number);
  if (number === null) notFound();
  const order = await getPurchaseOrder(number);
  if (!order) notFound();
  const back = `/admin/purchases/${order.number}`;
  const supplierName = order.supplier.tradeName ?? order.supplier.legalName;

  const warehouses = await db.warehouse.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return (
    <>
      <Link href={back} className="text-sm hover:underline">
        ← {interpolate(t.purchases.detailTitle, { number: order.number })}
      </Link>
      <h1 className="mt-4 text-2xl font-semibold">
        {interpolate(t.receipts.newTitle, { number: order.number })}
      </h1>
      <p className="mt-1 mb-6 text-sm">{supplierName}</p>
      {!RECEIVABLE_PO_STATES.includes(order.state) ? (
        <p className="text-sm opacity-70">{t.receipts.errors.notReceivable}</p>
      ) : (
        <ReceiptForm
          orderId={order.id}
          warehouses={warehouses}
          locale={locale}
          lines={order.items.map((item) => {
            const pending = pendingQuantity(item);
            return {
              productId: item.productId,
              name: item.product.name,
              sku: item.product.sku,
              unit: item.product.measurementUnit.name,
              allowsDecimals: item.product.measurementUnit.allowsDecimals,
              ordered: format.number(item.quantity),
              receivedBefore: format.number(item.receivedQuantity),
              pendingLabel: format.number(pending),
              pending,
              // Se precarga lo pendiente: lo común es que llegue lo pedido.
              initial:
                toMilli(pending) > BigInt(0) ? format.input(pending) : "",
            };
          })}
          t={t.receipts}
        />
      )}
    </>
  );
}
