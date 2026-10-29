import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import {
  CopyTextButton,
  PurchaseEditor,
} from "@/components/purchases/purchase-forms";
import { DifferenceLabel } from "@/components/purchases/difference-label";
import { ReasonForm } from "@/components/purchases/receipt-forms";
import { SheetActionButton } from "@/components/routes/route-forms";
import { buttonClass } from "@/components/ui/button";
import { interpolate } from "@/i18n/config";
import { formatters } from "@/i18n/format";
import { getLocale, getT } from "@/i18n/server";
import { getUserWithPermission } from "@/lib/auth";
import { lineTotals } from "@/lib/cart";
import { parseSaleNumber } from "@/lib/checkout";
import { formatCuit } from "@/lib/cuit";
import {
  RECEIPT_NOTES_MAX_LENGTH,
  RECEIVABLE_PO_STATES,
  receiptDifference,
} from "@/lib/goods-receipt";
import { isoDay } from "@/lib/order-period";
import { PO_CANCELABLE, purchaseOrderText } from "@/lib/purchase-order";
import { getPurchaseLines, getPurchaseOrder } from "@/lib/purchase-queries";
import { toMilli } from "@/lib/quantity";
import { closePurchaseOrderShort } from "../../receipts/actions";
import {
  backToDraft,
  cancelPurchaseOrder,
  sendPurchaseOrder,
} from "../actions";

const PATH = "/admin/purchases";

export async function generateMetadata({
  params,
}: PageProps<"/[lang]/admin/purchases/[number]">): Promise<Metadata> {
  const t = await getT();
  return {
    title: interpolate(t.purchases.detailTitle, {
      number: (await params).number,
    }),
  };
}

export default async function PurchaseOrderPage({
  params,
}: PageProps<"/[lang]/admin/purchases/[number]">) {
  const t = await getT();
  return (
    <main className="mx-auto w-full max-w-6xl p-8">
      <Link href={PATH} className="text-sm hover:underline">
        ← {t.purchases.title}
      </Link>
      {/* params y la orden son de request: van en Suspense. */}
      <Suspense
        fallback={<p className="mt-6 text-sm opacity-70">{t.common.loading}</p>}
      >
        <PurchaseOrder params={params} />
      </Suspense>
    </main>
  );
}

async function PurchaseOrder({
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

  const draft = order.state === "DRAFT";
  const supplierName = order.supplier.tradeName ?? order.supplier.legalName;
  const day = (value: string) =>
    format.date(new Date(`${value}T12:00:00-03:00`));

  // En borrador: los productos del proveedor con la sugerencia.
  await connection();
  const lines = draft
    ? await getPurchaseLines(order.supplier.id, order.id)
    : [];
  const hasLines = order.items.length > 0;

  const whatsapp = purchaseOrderText(
    {
      number: order.number,
      supplierName,
      expectedDate: order.expectedDate,
      notes: order.notes,
      items: order.items.map((item) => ({
        name: item.product.name,
        supplierCode:
          item.product.suppliers.find(
            (link) => link.supplierId === order.supplier.id,
          )?.supplierCode ?? null,
        quantity: format.number(item.quantity),
        unit: item.product.measurementUnit.name,
      })),
    },
    p.whatsapp,
    day,
  );

  return (
    <>
      <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold">
          {interpolate(p.detailTitle, { number: order.number })}
        </h1>
        <span className="rounded border border-current/20 px-2 py-0.5 text-sm">
          {p.states[order.state]}
        </span>
      </div>
      <p className="mt-1 text-sm">
        {supplierName} · CUIT {formatCuit(order.supplier.cuit)}
        {order.supplier.contactPhone && ` · ${order.supplier.contactPhone}`}
      </p>
      {order.sentAt && (
        <p className="text-xs opacity-70">
          {interpolate(p.sentAt, { date: format.dateTime(order.sentAt) })}
        </p>
      )}
      {order.closedAt && (
        <p className="mt-1 text-sm text-amber-700 dark:text-amber-400">
          {interpolate(p.closedShort, {
            date: format.dateTime(order.closedAt),
            note: order.closeNote ?? "",
          })}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-start gap-3">
        {RECEIVABLE_PO_STATES.includes(order.state) && (
          <Link
            href={`${PATH}/${order.number}/receive`}
            className={buttonClass()}
          >
            {p.receive}
          </Link>
        )}
        {draft && hasLines && (
          <SheetActionButton
            action={sendPurchaseOrder.bind(null, order.id)}
            label={p.send}
            pendingLabel={p.working}
            variant="primary"
          />
        )}
        {order.state === "SENT" && (
          <SheetActionButton
            action={backToDraft.bind(null, order.id)}
            label={p.backToDraft}
            pendingLabel={p.working}
          />
        )}
        {hasLines && (
          <>
            <Link
              href={`${PATH}/${order.number}/print`}
              className={buttonClass("secondary")}
            >
              {p.print}
            </Link>
            <CopyTextButton
              text={whatsapp}
              label={p.copyWhatsapp}
              copiedLabel={p.copied}
            />
          </>
        )}
        {PO_CANCELABLE.includes(order.state) && (
          <SheetActionButton
            action={cancelPurchaseOrder.bind(null, order.id)}
            label={p.cancel}
            confirm={interpolate(p.confirmCancel, { number: order.number })}
            variant="danger"
          />
        )}
      </div>

      {draft ? (
        <section className="mt-6">
          <h2 className="mb-3 text-lg font-medium">{p.lines}</h2>
          {lines.length === 0 ? (
            <p className="text-sm opacity-70">{p.noProducts}</p>
          ) : (
            <PurchaseEditor
              orderId={order.id}
              expectedDate={
                order.expectedDate
                  ? order.expectedDate.toISOString().slice(0, 10)
                  : ""
              }
              notes={order.notes ?? ""}
              today={isoDay(new Date())}
              lines={lines.map((line) => ({
                productId: line.productId,
                name: line.name,
                sku: line.sku,
                supplierCode: line.supplierCode,
                unit: line.unit,
                allowsDecimals: line.allowsDecimals,
                stock: format.number(line.stock),
                reserved: format.number(line.reserved),
                minStock: line.minStock ? format.number(line.minStock) : "—",
                onOrder: format.number(line.onOrder),
                suggested: format.number(line.suggested),
                // Sin líneas guardadas, se precarga la sugerencia.
                quantity: line.quantity
                  ? format.input(line.quantity)
                  : !hasLines && toMilli(line.suggested) > BigInt(0)
                    ? format.input(line.suggested)
                    : "",
                unitCost: line.unitCost
                  ? format.input(line.unitCost)
                  : line.lastCost
                    ? format.input(line.lastCost)
                    : "",
              }))}
              t={p}
            />
          )}
        </section>
      ) : (
        <>
          <PurchaseItems order={order} t={t} format={format} />
          <Receipts order={order} t={t} format={format} />
          {order.state === "PARTIALLY_RECEIVED" && (
            <div className="mt-6">
              <ReasonForm
                action={closePurchaseOrderShort.bind(null, order.id)}
                label={p.closeShort}
                hint={p.closeShortHint}
                reasonLabel={p.closeReason}
                pendingLabel={p.working}
                maxLength={RECEIPT_NOTES_MAX_LENGTH}
              />
            </div>
          )}
        </>
      )}
    </>
  );
}

/** Los informes de recepción de la OC. */
function Receipts({
  order,
  t,
  format,
}: {
  order: NonNullable<Awaited<ReturnType<typeof getPurchaseOrder>>>;
  t: Awaited<ReturnType<typeof getT>>;
  format: ReturnType<typeof formatters>;
}) {
  if (order.state === "SENT" && order.receipts.length === 0) return null;
  const r = t.receipts;
  return (
    <section className="mt-8">
      <h2 className="mb-2 text-lg font-medium">{t.purchases.receipts}</h2>
      {order.receipts.length === 0 ? (
        <p className="text-sm opacity-70">{t.purchases.noReceipts}</p>
      ) : (
        <ul className="flex flex-col gap-1 text-sm">
          {order.receipts.map((receipt) => (
            <li key={receipt.number}>
              <Link
                href={`/admin/receipts/${receipt.number}`}
                className="font-medium hover:underline"
              >
                {interpolate(r.detailTitle, { number: receipt.number })}
              </Link>{" "}
              · {format.date(receipt.createdAt)} · {receipt.warehouse.name}
              {receipt.deliveryNote && ` · ${receipt.deliveryNote}`}
              {receipt.state === "ANNULLED" && (
                <span className="text-red-600"> · {r.states.ANNULLED}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Lo pedido (fuera de borrador): productos, cantidades, costos y totales. */
function PurchaseItems({
  order,
  t,
  format,
}: {
  order: NonNullable<Awaited<ReturnType<typeof getPurchaseOrder>>>;
  t: Awaited<ReturnType<typeof getT>>;
  format: ReturnType<typeof formatters>;
}) {
  const c = t.purchases.columns;
  return (
    <section className="mt-6">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-current/20">
          <tr>
            <th className="py-2 pr-3 font-medium">{c.product}</th>
            <th className="py-2 pr-3 font-medium">{c.code}</th>
            <th className="py-2 pr-3 text-right font-medium">{c.quantity}</th>
            <th className="py-2 pr-3 text-right font-medium">{c.received}</th>
            <th className="py-2 pr-3 text-right font-medium">{c.difference}</th>
            <th className="py-2 pr-3 text-right font-medium">{c.unitCost}</th>
            <th className="py-2 text-right font-medium">{c.lineTotal}</th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((item) => (
            <tr key={item.productId} className="border-b border-current/10">
              <td className="py-2 pr-3">{item.product.name}</td>
              <td className="py-2 pr-3 font-mono text-xs">
                {item.product.suppliers.find(
                  (link) => link.supplierId === order.supplier.id,
                )?.supplierCode ?? "—"}
              </td>
              <td className="py-2 pr-3 text-right whitespace-nowrap">
                {format.number(item.quantity)}{" "}
                {item.product.measurementUnit.name}
              </td>
              <td className="py-2 pr-3 text-right whitespace-nowrap">
                {format.number(item.receivedQuantity)}
              </td>
              <td className="py-2 pr-3 text-right whitespace-nowrap">
                {/* Mientras no llegó nada no hay diferencia. */}
                {order.state === "SENT" ? (
                  <span className="opacity-50">—</span>
                ) : (
                  <DifferenceLabel
                    diff={receiptDifference(
                      item.quantity,
                      item.receivedQuantity,
                    )}
                    t={t.receipts}
                    format={format}
                  />
                )}
              </td>
              <td className="py-2 pr-3 text-right whitespace-nowrap">
                {format.money(item.unitCost)}
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
          ))}
        </tbody>
      </table>
      <dl className="mt-4 ml-auto flex w-full max-w-xs flex-col gap-1 text-sm">
        <div className="flex justify-between">
          <dt className="opacity-70">{t.purchases.net}</dt>
          <dd>{format.money(order.subTotal)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="opacity-70">{t.purchases.tax}</dt>
          <dd>{format.money(order.tax)}</dd>
        </div>
        <div className="flex justify-between border-t border-current/20 pt-1 font-semibold">
          <dt>{t.purchases.total}</dt>
          <dd>{format.money(order.total)}</dd>
        </div>
      </dl>
    </section>
  );
}
