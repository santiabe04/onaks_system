import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { INTL_LOCALE } from "@/i18n/config";
import { formatters } from "@/i18n/format";
import { getLocale, getT } from "@/i18n/server";
import { getUserWithPermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { isProductId } from "@/lib/product";
import { updateProduct } from "../../actions";
import { getProductFormOptions } from "../../form-options";
import { ProductForm } from "../../product-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.products.editTitle };
}

export default async function EditProductPage({
  params,
}: PageProps<"/[lang]/admin/products/[id]/edit">) {
  const t = await getT();

  return (
    <main className="mx-auto w-full max-w-2xl p-8">
      <h1 className="text-2xl font-semibold">{t.products.editTitle}</h1>
      {/* params y la query a la DB son de request: van en Suspense. */}
      <Suspense
        fallback={<p className="mt-6 text-sm opacity-70">{t.common.loading}</p>}
      >
        <EditForm params={params} />
      </Suspense>
    </main>
  );
}

async function EditForm({ params }: { params: Promise<{ id: string }> }) {
  await getUserWithPermission("products:manage");
  const { id } = await params;
  if (!isProductId(id)) notFound();

  const product = await db.product.findFirst({
    where: { id, deletedAt: null },
  });
  if (!product) notFound();

  const [t, locale, options] = await Promise.all([
    getT(),
    getLocale(),
    getProductFormOptions(product.taxRateId),
  ]);
  // Los decimales con el separador del idioma ("15,5" en español), sin miles.
  const decimal = formatters(locale).input;

  return (
    <ProductForm
      action={updateProduct.bind(null, product.id)}
      defaultValues={{
        name: product.name,
        sku: product.sku,
        barcode: product.barcode ?? "",
        description: product.description ?? "",
        categoryId: String(product.categoryId),
        measurementUnitId: String(product.measurementUnitId),
        taxRateId: String(product.taxRateId),
        price: decimal(product.price),
        weight: decimal(product.weight),
        volume: product.volume === null ? "" : decimal(product.volume),
        minStock: product.minStock === null ? "" : decimal(product.minStock),
        isActive: product.isActive,
      }}
      imageFile={product.imageFile}
      options={options}
      intlLocale={INTL_LOCALE[locale]}
      submitLabel={t.common.save}
      t={t.products}
      common={t.common}
    />
  );
}
