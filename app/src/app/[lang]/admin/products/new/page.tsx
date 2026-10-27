import type { Metadata } from "next";
import { Suspense } from "react";
import { INTL_LOCALE } from "@/i18n/config";
import { getLocale, getT } from "@/i18n/server";
import { getUserWithPermission } from "@/lib/auth";
import { createProduct } from "../actions";
import { getProductFormOptions } from "../form-options";
import { ProductForm } from "../product-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.products.newTitle };
}

export default async function NewProductPage() {
  const t = await getT();

  return (
    <main className="mx-auto w-full max-w-2xl p-8">
      <h1 className="text-2xl font-semibold">{t.products.newTitle}</h1>
      {/* Las opciones salen de la DB: va en Suspense. */}
      <Suspense
        fallback={<p className="mt-6 text-sm opacity-70">{t.common.loading}</p>}
      >
        <NewForm />
      </Suspense>
    </main>
  );
}

async function NewForm() {
  await getUserWithPermission("products:manage");
  const [t, locale, options] = await Promise.all([
    getT(),
    getLocale(),
    getProductFormOptions(),
  ]);

  return (
    <ProductForm
      action={createProduct}
      defaultValues={{
        name: "",
        sku: "",
        barcode: "",
        description: "",
        categoryId: "",
        measurementUnitId: "",
        taxRateId: "",
        price: "",
        weight: "",
        volume: "",
        isActive: true,
      }}
      options={options}
      intlLocale={INTL_LOCALE[locale]}
      submitLabel={t.common.create}
      t={t.products}
      common={t.common}
    />
  );
}
