import type { Metadata } from "next";
import { Suspense } from "react";
import { NewOrderForm } from "@/components/orders/new-order-form";
import { getLocale, getT } from "@/i18n/server";
import { getUserWithPermission } from "@/lib/auth";
import { VISIBLE_PRODUCT } from "@/lib/catalog";
import { formatCuit } from "@/lib/cuit";
import { db } from "@/lib/db";
import { isCuid } from "@/lib/ids";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.adminOrderNew.title };
}

// Pedidos que llegan por teléfono o WhatsApp: el admin los carga por el cliente.
export default async function NewOrderPage({
  searchParams,
}: PageProps<"/[lang]/admin/orders/new">) {
  const t = await getT();
  return (
    <main className="mx-auto w-full max-w-4xl p-4 sm:p-8">
      <h1 className="text-2xl font-semibold">{t.adminOrderNew.title}</h1>
      <p className="mt-1 mb-6 text-sm opacity-70">{t.adminOrderNew.hint}</p>
      {/* Clientes y productos salen de la DB: van en Suspense. */}
      <Suspense
        fallback={<p className="text-sm opacity-70">{t.common.loading}</p>}
      >
        <NewOrder searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function NewOrder({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await getUserWithPermission("sales:manage");
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const { customer } = await searchParams;

  const [customers, products] = await Promise.all([
    db.customer.findMany({
      where: { deletedAt: null },
      orderBy: { tradeName: "asc" },
      select: {
        id: true,
        tradeName: true,
        cuit: true,
        addresses: {
          where: { deletedAt: null },
          orderBy: { name: "asc" },
          select: {
            id: true,
            name: true,
            address: true,
            city: { select: { name: true } },
          },
        },
      },
    }),
    db.product.findMany({
      where: VISIBLE_PRODUCT,
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        sku: true,
        barcode: true,
        price: true,
        weight: true,
        taxRate: { select: { rate: true } },
        measurementUnit: { select: { name: true, allowsDecimals: true } },
      },
    }),
  ]);

  return (
    <NewOrderForm
      customers={customers.map((row) => ({
        id: row.id,
        name: row.tradeName,
        cuit: formatCuit(row.cuit),
        addresses: row.addresses.map((address) => ({
          id: address.id,
          name: address.name,
          detail: `${address.address}, ${address.city.name}`,
        })),
      }))}
      products={products.map((row) => ({
        id: row.id,
        name: row.name,
        sku: row.sku,
        barcode: row.barcode,
        unit: row.measurementUnit.name,
        allowsDecimals: row.measurementUnit.allowsDecimals,
        price: row.price.toString(),
        rate: row.taxRate.rate.toString(),
        weight: row.weight.toString(),
      }))}
      initialCustomerId={
        isCuid(customer) && customers.some((row) => row.id === customer)
          ? customer
          : ""
      }
      locale={locale}
      t={t.adminOrderNew}
    />
  );
}
