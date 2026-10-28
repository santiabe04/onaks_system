import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { interpolate } from "@/i18n/config";
import { formatters } from "@/i18n/format";
import { getLocale, getT } from "@/i18n/server";
import { getUserWithPermission } from "@/lib/auth";
import { VISIBLE_PRODUCT } from "@/lib/catalog";
import { CATALOG_PRODUCT_SELECT, toCatalogItem } from "@/lib/catalog-queries";
import { flattenCategoryTree } from "@/lib/category";
import { db } from "@/lib/db";
import { isProductId } from "@/lib/product";

export async function generateMetadata({
  params,
}: PageProps<"/[lang]/products/[id]">): Promise<Metadata> {
  const { id } = await params;
  const product = isProductId(id)
    ? await db.product.findFirst({
        where: { id, ...VISIBLE_PRODUCT },
        select: { name: true },
      })
    : null;
  return { title: product?.name ?? (await getT()).catalog.title };
}

export default async function ProductPage({
  params,
}: PageProps<"/[lang]/products/[id]">) {
  const t = await getT();

  return (
    <main className="mx-auto w-full max-w-5xl p-4 sm:p-8">
      <Link href="/" className="text-sm hover:underline">
        ← {t.catalog.back}
      </Link>
      {/* params y la DB son de request: va en Suspense. */}
      <Suspense
        fallback={<p className="mt-6 text-sm opacity-70">{t.common.loading}</p>}
      >
        <ProductDetail params={params} />
      </Suspense>
    </main>
  );
}

async function ProductDetail({ params }: { params: Promise<{ id: string }> }) {
  await getUserWithPermission("catalog:read");
  const { id } = await params;
  if (!isProductId(id)) notFound();

  // Pausados o borrados no existen para el cliente.
  const product = await db.product.findFirst({
    where: { id, ...VISIBLE_PRODUCT },
    select: {
      ...CATALOG_PRODUCT_SELECT,
      barcode: true,
      volume: true,
      categoryId: true,
    },
  });
  if (!product) notFound();

  const [t, locale, categories] = await Promise.all([
    getT(),
    getLocale(),
    db.category.findMany({ select: { id: true, name: true, parentId: true } }),
  ]);
  const format = formatters(locale);
  const item = toCatalogItem(product, locale, t.catalog);
  const path = flattenCategoryTree(categories).find(
    (node) => node.id === product.categoryId,
  )?.path;

  return (
    <article className="mt-6 grid gap-8 md:grid-cols-2">
      {item.imageUrl ? (
        <Image
          src={item.imageUrl}
          alt={item.name}
          width={1200}
          height={1200}
          unoptimized
          className="aspect-square w-full rounded border border-current/20 object-contain"
        />
      ) : (
        <div className="flex aspect-square w-full items-center justify-center rounded border border-current/20 bg-current/5 text-sm opacity-50">
          {t.catalog.noImage}
        </div>
      )}

      <div className="flex flex-col gap-3">
        {path && (
          <nav className="text-xs opacity-70">
            {path.map((name, index) => (
              <span key={index}>
                {index > 0 && " › "}
                {name}
              </span>
            ))}
          </nav>
        )}
        <h1 className="text-2xl font-semibold">{item.name}</h1>
        <p className="text-sm opacity-70">
          {interpolate(t.catalog.sku, { sku: item.sku })}
          {product.barcode &&
            ` · ${interpolate(t.catalog.barcode, { code: product.barcode })}`}
        </p>
        <div>
          <p className="text-3xl font-semibold">{item.finalPrice}</p>
          <p className="text-sm opacity-70">{item.netLine}</p>
        </div>
        <p className="text-sm">
          {interpolate(t.catalog.unit, { unit: product.measurementUnit.name })}{" "}
          ·{" "}
          {interpolate(t.catalog.weight, {
            weight: format.number(product.weight),
          })}
          {product.volume !== null &&
            ` · ${interpolate(t.catalog.volume, {
              volume: format.number(product.volume),
            })}`}
        </p>
        {item.description && (
          <p className="text-sm whitespace-pre-line">{item.description}</p>
        )}
      </div>
    </article>
  );
}
