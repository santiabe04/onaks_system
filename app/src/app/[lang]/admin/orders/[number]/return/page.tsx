import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { interpolate } from "@/i18n/config";
import { getLocale, getT } from "@/i18n/server";
import { getUserWithPermission } from "@/lib/auth";
import { parseSaleNumber } from "@/lib/checkout";
import { remainingQuantity } from "@/lib/customer-credit";
import { returnableLines } from "@/lib/customer-credit-queries";
import { db } from "@/lib/db";
import { ReturnForm } from "./return-form";

export async function generateMetadata({
  params,
}: PageProps<"/[lang]/admin/orders/[number]/return">): Promise<Metadata> {
  const t = await getT();
  return {
    title: interpolate(t.customerCreditNotes.returnTitle, {
      number: (await params).number,
    }),
  };
}

export default async function ReturnPage({
  params,
}: PageProps<"/[lang]/admin/orders/[number]/return">) {
  const t = await getT();

  return (
    <main className="mx-auto w-full max-w-4xl p-4 sm:p-8">
      {/* params and the DB are request-bound: they go in Suspense. */}
      <Suspense
        fallback={<p className="text-sm opacity-70">{t.common.loading}</p>}
      >
        <Return params={params} />
      </Suspense>
    </main>
  );
}

async function Return({ params }: { params: Promise<{ number: string }> }) {
  await getUserWithPermission("sales:manage");
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const c = t.customerCreditNotes;

  const number = parseSaleNumber((await params).number);
  if (number === null) notFound();
  const found = await db.sale.findUnique({
    where: { number },
    select: { id: true },
  });
  if (!found) notFound();
  const sale = await returnableLines(db, found.id);
  if (!sale) notFound();

  const warehouses = await db.warehouse.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  const lines = sale.lines
    .map((line) => ({ ...line, left: remainingQuantity(line) }))
    .sort((a, b) => a.name.localeCompare(b.name, locale));
  const nothingLeft = lines.every((line) => Number(line.left) === 0);

  return (
    <>
      <Link
        href={`/admin/orders/${sale.number}`}
        className="text-sm hover:underline"
      >
        {interpolate(c.back, { number: sale.number })}
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">
        {interpolate(c.returnTitle, { number: sale.number })}
      </h1>
      {!sale.returnable ? (
        <p className="mt-4 text-sm">{c.notReturnable}</p>
      ) : nothingLeft ? (
        <p className="mt-4 text-sm">{c.nothingLeft}</p>
      ) : (
        <>
          <p className="mt-1 mb-6 text-sm opacity-70">{c.returnHint}</p>
          <ReturnForm
            saleId={sale.id}
            warehouses={warehouses}
            lines={lines.map((line) => ({
              productId: line.productId,
              name: line.name,
              sku: line.sku,
              unit: line.unit,
              allowsDecimals: line.allowsDecimals,
              delivered: line.quantity.toString(),
              returned: line.returned.toString(),
              left: line.left,
              unitPrice: line.unitPrice.toString(),
              unitTaxRate: line.unitTaxRate.toString(),
            }))}
            locale={locale}
            t={c}
          />
        </>
      )}
    </>
  );
}
