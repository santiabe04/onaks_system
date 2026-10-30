import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { buttonClass } from "@/components/ui/button";
import { CatalogView, ViewToggle } from "@/components/catalog/catalog-view";
import { interpolate } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionary";
import { formatters } from "@/i18n/format";
import { getLocale, getT } from "@/i18n/server";
import { getUserWithPermission } from "@/lib/auth";
import {
  CATALOG_PAGE_SIZE,
  catalogQuery,
  catalogWhere,
  parseCatalogFilters,
  type CatalogFilters,
} from "@/lib/catalog";
import {
  CATALOG_PRODUCT_SELECT,
  getCatalogCategories,
  toCatalogItem,
} from "@/lib/catalog-queries";
import { descendantIds, type CategoryNode } from "@/lib/category";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { getPricing } from "@/lib/pricing-queries";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.catalog.title };
}

export default async function CatalogPage({
  searchParams,
}: PageProps<"/[lang]">) {
  const t = await getT();

  return (
    <main className="mx-auto w-full max-w-6xl p-4 sm:p-4 sm:p-8">
      {/* Los filtros vienen de la URL y los productos de la DB: van en Suspense. */}
      <Suspense
        fallback={<p className="text-sm opacity-70">{t.common.loading}</p>}
      >
        <Catalog searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Catalog({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getUserWithPermission("catalog:read");
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const filters = parseCatalogFilters(await searchParams);

  const [categories, rows] = await Promise.all([
    getCatalogCategories(),
    db.category.findMany({ select: { id: true, name: true, parentId: true } }),
  ]);
  // Filtrar por una categoría incluye sus subcategorías.
  const categoryIds = filters.category
    ? [filters.category, ...descendantIds(rows, filters.category)]
    : undefined;
  const where = catalogWhere(filters, categoryIds);

  const [total, products] = await Promise.all([
    db.product.count({ where }),
    db.product.findMany({
      where,
      orderBy: [{ name: "asc" }, { id: "asc" }],
      skip: (filters.page - 1) * CATALOG_PAGE_SIZE,
      take: CATALOG_PAGE_SIZE,
      select: CATALOG_PRODUCT_SELECT,
    }),
  ]);
  const pages = Math.max(1, Math.ceil(total / CATALOG_PAGE_SIZE));
  const pricing = await getPricing(
    user.customerId,
    products.map((p) => p.id),
  );
  const items = products.map((p) =>
    toCatalogItem(p, locale, t.catalog, pricing),
  );
  const current = categories.find((c) => c.id === filters.category);

  return (
    <div className="flex flex-col gap-6 md:flex-row md:items-start">
      <CategoryMenu categories={categories} filters={filters} t={t.catalog} />

      <div className="min-w-0 flex-1">
        <form action="/" className="flex gap-3 text-sm">
          {filters.category && (
            <input type="hidden" name="category" value={filters.category} />
          )}
          <input
            type="search"
            name="q"
            defaultValue={filters.q}
            placeholder={t.catalog.searchPlaceholder}
            aria-label={t.catalog.search}
            className="w-full rounded border border-current/20 bg-transparent px-3 py-2"
          />
          <button type="submit" className={buttonClass()}>
            {t.catalog.search}
          </button>
        </form>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">
              {current ? current.path.join(" › ") : t.catalog.allProducts}
            </h1>
            {filters.q && (
              <p className="text-sm opacity-70">
                {interpolate(t.catalog.resultsFor, { q: filters.q })} ·{" "}
                <Link
                  href={`/${catalogQuery(filters, { q: undefined, page: 1 })}`}
                  className="underline"
                >
                  {t.catalog.clearSearch}
                </Link>
              </p>
            )}
          </div>
          <ViewToggle t={t.catalog} />
        </div>

        <div className="mt-4">
          {items.length === 0 ? (
            <p className="text-sm opacity-70">{t.catalog.empty}</p>
          ) : (
            <CatalogView
              items={items}
              canBuy={can(user.role, "sales:create")}
              t={t.catalog}
              cart={t.cart}
            />
          )}
        </div>

        <nav className="mt-6 flex items-center justify-between gap-4 text-sm">
          <span className="opacity-70">
            {interpolate(t.catalog.count, {
              count: formatters(locale).number(total),
            })}{" "}
            · {interpolate(t.catalog.page, { page: filters.page, pages })}
          </span>
          <div className="flex gap-3">
            {filters.page > 1 && (
              <Link
                href={`/${catalogQuery(filters, { page: filters.page - 1 })}`}
                className={buttonClass("secondary")}
              >
                {t.catalog.previous}
              </Link>
            )}
            {filters.page < pages && (
              <Link
                href={`/${catalogQuery(filters, { page: filters.page + 1 })}`}
                className={buttonClass("secondary")}
              >
                {t.catalog.next}
              </Link>
            )}
          </div>
        </nav>
      </div>
    </div>
  );
}

/**
 * Árbol de categorías: columna a la izquierda en escritorio, desplegable en
 * celular. Cambiar de categoría conserva la búsqueda y vuelve a la página 1.
 */
function CategoryMenu({
  categories,
  filters,
  t,
}: {
  categories: CategoryNode[];
  filters: CatalogFilters;
  t: Dictionary["catalog"];
}) {
  const item = (href: string, label: string, active: boolean, depth = 1) => (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      style={{ paddingLeft: `${0.5 + (depth - 1) * 0.75}rem` }}
      className={`block rounded py-1 pr-2 text-sm ${
        active ? "bg-current/10 font-medium" : "hover:bg-current/5"
      }`}
    >
      {label}
    </Link>
  );
  const list = (
    <nav className="flex flex-col">
      {item(
        `/${catalogQuery(filters, { category: undefined, page: 1 })}`,
        t.allProducts,
        !filters.category,
      )}
      {categories.map((category) => (
        <div key={category.id}>
          {item(
            `/${catalogQuery(filters, { category: category.id, page: 1 })}`,
            category.name,
            filters.category === category.id,
            category.depth,
          )}
        </div>
      ))}
    </nav>
  );

  return (
    <aside className="md:w-56 md:shrink-0">
      <details className="rounded border border-current/20 p-2 md:hidden">
        <summary className="cursor-pointer text-sm font-medium">
          {t.categories}
        </summary>
        <div className="mt-2">{list}</div>
      </details>
      <div className="hidden md:block">
        <p className="px-2 pb-1 text-xs font-medium tracking-wide uppercase opacity-50">
          {t.categories}
        </p>
        {list}
      </div>
    </aside>
  );
}
