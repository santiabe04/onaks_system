import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { formatters } from "@/i18n/format";
import { getLocale, getT } from "@/i18n/server";
import { getUserWithPermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { isCuid } from "@/lib/ids";
import { fractionToPercent } from "@/lib/tax-rate";
import { saveFixedPrices, updatePriceList } from "../actions";
import { FixedPricesForm } from "../fixed-prices-form";
import { PriceListForm } from "../price-list-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.priceLists.editTitle };
}

export default async function EditPriceListPage({
  params,
}: PageProps<"/[lang]/admin/price-lists/[id]">) {
  const t = await getT();

  return (
    <main className="mx-auto w-full max-w-4xl p-4 sm:p-8">
      <h1 className="text-2xl font-semibold">{t.priceLists.editTitle}</h1>
      {/* params y la query a la DB son de request: van en Suspense. */}
      <Suspense
        fallback={<p className="mt-6 text-sm opacity-70">{t.common.loading}</p>}
      >
        <EditPriceList params={params} />
      </Suspense>
    </main>
  );
}

async function EditPriceList({ params }: { params: Promise<{ id: string }> }) {
  await getUserWithPermission("price-lists:manage");
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const format = formatters(locale);

  const { id } = await params;
  if (!isCuid(id)) notFound();
  const [priceList, products] = await Promise.all([
    db.priceList.findUnique({
      where: { id },
      include: { items: { select: { productId: true, price: true } } },
    }),
    // Todos los no borrados: un pausado puede volver a venderse.
    db.product.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, sku: true, price: true },
    }),
  ]);
  if (!priceList) notFound();
  const fixed = new Map(
    priceList.items.map((item) => [item.productId, item.price]),
  );

  return (
    <>
      <div className="max-w-md">
        <PriceListForm
          action={updatePriceList.bind(null, priceList.id)}
          defaultValues={{
            name: priceList.name,
            // Con el separador decimal del idioma: "-10" o "2,5".
            adjustment: format.number(fractionToPercent(priceList.adjustment)),
          }}
          submitLabel={t.common.save}
          t={t.priceLists}
          common={t.common}
        />
      </div>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">
          {t.priceLists.fixedPricesTitle}
        </h2>
        <p className="mt-1 text-sm opacity-70">
          {t.priceLists.fixedPricesHint}
        </p>
        <FixedPricesForm
          action={saveFixedPrices.bind(null, priceList.id)}
          adjustment={priceList.adjustment.toString()}
          products={products.map((product) => {
            const price = fixed.get(product.id);
            return {
              id: product.id,
              name: product.name,
              sku: product.sku,
              price: product.price.toString(),
              fixed: price ? format.input(price) : "",
            };
          })}
          locale={locale}
          t={t.priceLists}
        />
      </section>
    </>
  );
}
