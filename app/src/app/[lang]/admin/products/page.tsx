import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { buttonClass } from "@/components/ui/button";
import { DeleteButton } from "@/components/ui/delete-button";
import { interpolate } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionary";
import { formatters } from "@/i18n/format";
import { getLocale, getT } from "@/i18n/server";
import { getUserWithPermission } from "@/lib/auth";
import { descendantIds, flattenCategoryTree } from "@/lib/category";
import { db } from "@/lib/db";
import { finalPrice } from "@/lib/price";
import { toMilli } from "@/lib/quantity";
import { productImageUrl } from "@/lib/product";
import {
  parseProductFilters,
  PRODUCT_PAGE_SIZE,
  productQuery,
  productWhere,
  type ProductFilters,
} from "@/lib/product-filters";
import { deleteProduct } from "./actions";

const PATH = "/admin/products";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.products.title };
}

export default async function ProductsPage({
  searchParams,
}: PageProps<"/[lang]/admin/products">) {
  const t = await getT();

  return (
    <main className="mx-auto w-full max-w-6xl p-8">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{t.products.title}</h1>
        <Link href="/admin/products/new" className={buttonClass()}>
          {t.products.newButton}
        </Link>
      </div>

      {/* Los filtros vienen de la URL y la lista de la DB: van en Suspense. */}
      <Suspense
        fallback={<p className="mt-6 text-sm opacity-70">{t.common.loading}</p>}
      >
        <ProductsContent searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function ProductsContent({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await getUserWithPermission("products:manage");
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const format = formatters(locale);
  const filters = parseProductFilters(await searchParams);

  const categories = await db.category.findMany({
    select: { id: true, name: true, parentId: true },
  });
  const tree = flattenCategoryTree(categories);
  const paths = new Map(tree.map((node) => [node.id, node.path.join(" › ")]));
  // Filtrar por una categoría incluye sus subcategorías.
  const categoryIds = filters.category
    ? [filters.category, ...descendantIds(categories, filters.category)]
    : undefined;
  const where = productWhere(filters, categoryIds);

  const [total, products] = await Promise.all([
    db.product.count({ where }),
    db.product.findMany({
      where,
      orderBy: [{ name: "asc" }, { id: "asc" }],
      skip: (filters.page - 1) * PRODUCT_PAGE_SIZE,
      take: PRODUCT_PAGE_SIZE,
      include: { taxRate: { select: { rate: true } } },
    }),
  ]);
  // Stock total (todos los depósitos) de los productos de esta página.
  const stocks = await db.productStock.groupBy({
    by: ["productId"],
    where: { productId: { in: products.map((p) => p.id) } },
    _sum: { quantity: true },
  });
  const stockOf = (productId: string) =>
    stocks.find((s) => s.productId === productId)?._sum.quantity ?? 0;
  const pages = Math.max(1, Math.ceil(total / PRODUCT_PAGE_SIZE));

  return (
    <>
      <FiltersForm
        t={t.products}
        filters={filters}
        categories={tree.map((node) => ({
          id: node.id,
          label: node.path.join(" › "),
        }))}
      />

      {products.length === 0 ? (
        <p className="mt-6 text-sm opacity-70">{t.products.empty}</p>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-current/20">
              <tr>
                <th className="py-2 pr-3">
                  <span className="sr-only">{t.products.image}</span>
                </th>
                <th className="py-2 pr-3 font-medium">{t.products.name}</th>
                <th className="py-2 pr-3 font-medium">{t.products.category}</th>
                <th className="py-2 pr-3 text-right font-medium">
                  {t.products.price}
                </th>
                <th className="py-2 pr-3 text-right font-medium">
                  {t.products.finalPrice}
                </th>
                <th className="py-2 pr-3 text-right font-medium">
                  {t.products.stock}
                </th>
                <th className="py-2 pr-3 font-medium">{t.products.status}</th>
                <th className="py-2">
                  <span className="sr-only">{t.common.actions}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr
                  key={product.id}
                  className={`border-b border-current/10 align-top ${
                    product.isActive ? "" : "opacity-60"
                  }`}
                >
                  <td className="py-2 pr-3">
                    {product.imageFile ? (
                      <Image
                        src={productImageUrl(product.imageFile)}
                        alt=""
                        width={40}
                        height={40}
                        unoptimized
                        className="h-10 w-10 rounded border border-current/20 object-cover"
                      />
                    ) : (
                      <div className="h-10 w-10 rounded border border-dashed border-current/20" />
                    )}
                  </td>
                  <td className="py-2 pr-3">
                    {product.name}
                    <span className="block font-mono text-xs opacity-70">
                      {product.sku}
                    </span>
                  </td>
                  <td className="py-2 pr-3">
                    {paths.get(product.categoryId) ?? "—"}
                  </td>
                  <td className="py-2 pr-3 text-right whitespace-nowrap">
                    {format.money(product.price)}
                  </td>
                  <td className="py-2 pr-3 text-right whitespace-nowrap">
                    {format.money(
                      finalPrice(product.price, product.taxRate.rate),
                    )}
                  </td>
                  <td
                    className={`py-2 pr-3 text-right font-mono whitespace-nowrap ${
                      toMilli(stockOf(product.id)) < BigInt(0)
                        ? "text-red-600"
                        : ""
                    }`}
                  >
                    <Link
                      href={`/admin/stock/${product.id}`}
                      className="hover:underline"
                    >
                      {format.number(stockOf(product.id))}
                    </Link>
                  </td>
                  <td className="py-2 pr-3">
                    {product.isActive ? t.products.active : t.products.paused}
                  </td>
                  <td className="py-2">
                    <div className="flex items-start justify-end gap-4">
                      <Link
                        href={`/admin/products/${product.id}/edit`}
                        className="hover:underline"
                      >
                        {t.common.edit}
                      </Link>
                      <DeleteButton
                        action={deleteProduct.bind(null, product.id)}
                        confirmMessage={interpolate(t.products.confirmDelete, {
                          name: product.name,
                        })}
                        labels={{
                          delete: t.common.delete,
                          deleting: t.common.deleting,
                        }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <nav className="mt-6 flex items-center justify-between gap-4 text-sm">
        <span className="opacity-70">
          {interpolate(t.products.total, { count: format.number(total) })} ·{" "}
          {interpolate(t.products.page, { page: filters.page, pages })}
        </span>
        <div className="flex gap-3">
          {filters.page > 1 && (
            <Link
              href={`${PATH}${productQuery(filters, filters.page - 1)}`}
              className={buttonClass("secondary")}
            >
              {t.products.previous}
            </Link>
          )}
          {filters.page < pages && (
            <Link
              href={`${PATH}${productQuery(filters, filters.page + 1)}`}
              className={buttonClass("secondary")}
            >
              {t.products.next}
            </Link>
          )}
        </div>
      </nav>
    </>
  );
}

// Formulario GET: los filtros quedan en la URL, se pueden compartir y recargar.
function FiltersForm({
  t,
  filters,
  categories,
}: {
  t: Dictionary["products"];
  filters: ProductFilters;
  categories: { id: number; label: string }[];
}) {
  const control = "rounded border border-current/20 bg-transparent px-3 py-2";

  return (
    <form
      action={PATH}
      className="mt-6 grid grid-cols-1 items-end gap-3 text-sm md:grid-cols-[2fr_2fr_1fr_auto]"
    >
      <label className="flex flex-col gap-1">
        <span className="font-medium">{t.search}</span>
        <input
          type="search"
          name="q"
          defaultValue={filters.q}
          placeholder={t.searchPlaceholder}
          className={control}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-medium">{t.category}</span>
        <select
          name="category"
          defaultValue={filters.category ?? ""}
          className={control}
        >
          <option value="">{t.allCategories}</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-medium">{t.status}</span>
        <select name="status" defaultValue={filters.status} className={control}>
          <option value="all">{t.statusAll}</option>
          <option value="active">{t.statusActive}</option>
          <option value="paused">{t.statusPaused}</option>
        </select>
      </label>
      <div className="flex gap-3">
        <button type="submit" className={buttonClass()}>
          {t.filter}
        </button>
        <Link href={PATH} className={buttonClass("secondary")}>
          {t.clear}
        </Link>
      </div>
    </form>
  );
}
