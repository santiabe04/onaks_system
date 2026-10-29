import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PickingRoute } from "@/components/picking/picking-route";
import { PrintButton } from "@/components/ui/print-button";
import { interpolate } from "@/i18n/config";
import { formatters } from "@/i18n/format";
import { getLocale, getT } from "@/i18n/server";
import { APP_NAME } from "@/lib/app";
import { getUserWithPermission } from "@/lib/auth";
import { parseSaleNumber } from "@/lib/checkout";
import { getPickingList } from "@/lib/picking-queries";

export async function generateMetadata({
  params,
}: PageProps<"/[lang]/admin/picking/[number]/print">): Promise<Metadata> {
  const t = await getT();
  return {
    title: interpolate(t.picking.detailTitle, {
      number: (await params).number,
    }),
  };
}

// La lista para el depósito: el recorrido con casillas y el armado por pedido.
export default async function PickingPrintPage({
  params,
}: PageProps<"/[lang]/admin/picking/[number]/print">) {
  const t = await getT();
  return (
    <main className="mx-auto w-full max-w-4xl p-8 print:p-0">
      {/* params y la lista son de request: van en Suspense. */}
      <Suspense
        fallback={<p className="text-sm opacity-70">{t.common.loading}</p>}
      >
        <PrintablePicking params={params} />
      </Suspense>
    </main>
  );
}

async function PrintablePicking({
  params,
}: {
  params: Promise<{ number: string }>;
}) {
  await getUserWithPermission("sales:manage");
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const format = formatters(locale);
  const p = t.picking;

  const number = parseSaleNumber((await params).number);
  if (number === null) notFound();
  const found = await getPickingList(number);
  if (!found) notFound();
  const { list, lines } = found;
  const orders = [...new Set(lines.map((line) => line.saleId))].map((id) =>
    lines.filter((line) => line.saleId === id),
  );

  return (
    <>
      <div className="mb-4 flex gap-3 print:hidden">
        <PrintButton label={p.print} />
        <Link
          href={`/admin/picking/${list.number}`}
          className="self-center text-sm hover:underline"
        >
          ← {interpolate(p.detailTitle, { number: list.number })}
        </Link>
      </div>

      <header className="border-b border-current/30 pb-3">
        <h1 className="text-xl font-semibold">
          {interpolate(p.detailTitle, { number: list.number })} ·{" "}
          {list.warehouse.name}
        </h1>
        <p className="text-sm">
          {format.dateTime(list.createdAt)} · {APP_NAME} ·{" "}
          {orders.length === 1
            ? p.oneOrder
            : interpolate(p.ordersCount, { count: orders.length })}
        </p>
        {list.notes && <p className="text-sm">{list.notes}</p>}
      </header>

      <h2 className="mt-4 mb-2 font-medium">{p.route}</h2>
      <PickingRoute lines={lines} t={p} format={format} checkboxes />

      <h2 className="mt-6 mb-2 font-medium">{p.byOrder}</h2>
      <div className="grid grid-cols-2 gap-3 text-xs">
        {orders.map((own) => (
          <section
            key={own[0].saleId}
            className="break-inside-avoid rounded border border-current/30 p-2"
          >
            <p className="font-semibold">
              #{own[0].saleNumber} · {own[0].customer}
            </p>
            <ul>
              {own.map((line) => (
                <li key={line.productId}>
                  ☐ {format.number(line.quantity)} {line.unit} · {line.name}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <footer className="mt-12 flex justify-end text-xs">
        <p className="w-64 border-t border-current/50 pt-1">{p.signature}</p>
      </footer>
    </>
  );
}
