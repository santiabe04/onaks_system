import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { buttonClass } from "@/components/ui/button";
import { interpolate } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionary";
import { formatters } from "@/i18n/format";
import { getLocale, getT } from "@/i18n/server";
import { getUserWithPermission } from "@/lib/auth";
import { descendantIds, flattenCategoryTree } from "@/lib/category";
import { RESERVED_SALE_STATES } from "@/lib/checkout";
import { db } from "@/lib/db";
import { productWhere } from "@/lib/product-filters";
import { fromMilli, toMilli } from "@/lib/quantity";
import {
  parseStockFilters,
  STOCK_PAGE_SIZE,
  stockQuery,
  type StockFilters,
} from "@/lib/stock-filters";

const PATH = "/admin/stock";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.stock.title };
}

export default async function StockPage({
  searchParams,
}: PageProps<"/[lang]/admin/stock">) {
  const t = await getT();

  return (
    <main className="mx-auto w-full max-w-6xl p-8">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{t.stock.title}</h1>
        <Link href="/admin/stock/new" className={buttonClass()}>
          {t.stock.newMovement}
        </Link>
      </div>

      {/* Los filtros vienen de la URL y los saldos de la DB: van en Suspense. */}
      <Suspense
        fallback={<p className="mt-6 text-sm opacity-70">{t.common.loading}</p>}
      >
        <StockContent searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function StockContent({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await getUserWithPermission("stock:manage");
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const format = formatters(locale);
  const filters = parseStockFilters(await searchParams);

  const [categories, warehouses] = await Promise.all([
    db.category.findMany({ select: { id: true, name: true, parentId: true } }),
    db.warehouse.findMany({
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      select: { id: true, name: true, isActive: true },
    }),
  ]);
  // Columnas: el depósito filtrado, o los activos.
  const columns = filters.warehouse
    ? warehouses.filter((w) => w.id === filters.warehouse)
    : warehouses.filter((w) => w.isActive);

  // El nivel se calcula sobre la suma (de todos o del depósito filtrado).
  // Sin movimientos no hay fila de saldo: cuenta como 0.
  const stockWhere = filters.warehouse
    ? { warehouseId: filters.warehouse }
    : {};
  const levelIds =
    filters.level === "all"
      ? undefined
      : filters.level === "low"
        ? await lowStockIds(stockWhere)
        : await db.productStock
            .groupBy({
              by: ["productId"],
              where: stockWhere,
              _sum: { quantity: true },
              having: {
                quantity: {
                  _sum: filters.level === "out" ? { gt: 0 } : { lt: 0 },
                },
              },
            })
            .then((rows) => rows.map((row) => row.productId));

  const categoryIds = filters.category
    ? [filters.category, ...descendantIds(categories, filters.category)]
    : undefined;
  const where = {
    ...productWhere(
      { q: filters.q, status: "all", page: filters.page },
      categoryIds,
    ),
    id: !levelIds
      ? undefined
      : filters.level === "out"
        ? { notIn: levelIds }
        : { in: levelIds },
  };

  const [total, products] = await Promise.all([
    db.product.count({ where }),
    db.product.findMany({
      where,
      orderBy: [{ name: "asc" }, { id: "asc" }],
      skip: (filters.page - 1) * STOCK_PAGE_SIZE,
      take: STOCK_PAGE_SIZE,
      select: { id: true, name: true, sku: true, isActive: true },
    }),
  ]);
  const productIds = products.map((p) => p.id);
  const [stocks, reservedRows] = await Promise.all([
    db.productStock.findMany({
      where: { productId: { in: productIds }, ...stockWhere },
      select: { productId: true, warehouseId: true, quantity: true },
    }),
    // Lo pedido y todavía sin descontar: no es de un depósito, sino del total.
    db.saleItem.groupBy({
      by: ["productId"],
      where: {
        productId: { in: productIds },
        sale: { state: { in: RESERVED_SALE_STATES } },
      },
      _sum: { quantity: true },
    }),
  ]);
  const balance = (productId: string, warehouseId: string) =>
    stocks.find(
      (s) => s.productId === productId && s.warehouseId === warehouseId,
    )?.quantity ?? 0;
  const totalOf = (productId: string) =>
    fromMilli(
      stocks
        .filter((s) => s.productId === productId)
        .reduce((sum, s) => sum + toMilli(s.quantity), BigInt(0)),
    );
  const reservedOf = (productId: string) =>
    toMilli(
      reservedRows.find((row) => row.productId === productId)?._sum.quantity ??
        0,
    );
  const pages = Math.max(1, Math.ceil(total / STOCK_PAGE_SIZE));

  return (
    <>
      <FiltersForm
        t={t.stock}
        filters={filters}
        categories={flattenCategoryTree(categories).map((node) => ({
          id: node.id,
          label: node.path.join(" › "),
        }))}
        warehouses={warehouses}
      />

      {products.length === 0 ? (
        <p className="mt-6 text-sm opacity-70">{t.stock.empty}</p>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-current/20">
              <tr>
                <th className="py-2 pr-3 font-medium">{t.stock.product}</th>
                {columns.map((warehouse) => (
                  <th
                    key={warehouse.id}
                    className="py-2 pr-3 text-right font-medium"
                  >
                    {warehouse.name}
                  </th>
                ))}
                {!filters.warehouse && (
                  <>
                    <th className="py-2 pr-3 text-right font-medium">
                      {t.stock.total}
                    </th>
                    <th
                      className="py-2 pr-3 text-right font-medium"
                      title={t.stock.reservedHint}
                    >
                      {t.stock.reserved}
                    </th>
                    <th className="py-2 pr-3 text-right font-medium">
                      {t.stock.available}
                    </th>
                  </>
                )}
                <th className="py-2">
                  <span className="sr-only">{t.common.actions}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr
                  key={product.id}
                  className="border-b border-current/10 align-top"
                >
                  <td className="py-2 pr-3">
                    {product.name}
                    <span className="block font-mono text-xs opacity-70">
                      {product.sku}
                      {!product.isActive && ` · ${t.stock.paused}`}
                    </span>
                  </td>
                  {columns.map((warehouse) => (
                    <Quantity
                      key={warehouse.id}
                      value={balance(product.id, warehouse.id)}
                      format={format.number}
                    />
                  ))}
                  {!filters.warehouse && (
                    <>
                      <Quantity
                        value={totalOf(product.id)}
                        format={format.number}
                      />
                      <Quantity
                        value={fromMilli(reservedOf(product.id))}
                        format={format.number}
                      />
                      <Quantity
                        value={fromMilli(
                          toMilli(totalOf(product.id)) - reservedOf(product.id),
                        )}
                        format={format.number}
                        strong
                      />
                    </>
                  )}
                  <td className="py-2 text-right">
                    <Link
                      href={`${PATH}/${product.id}`}
                      className="hover:underline"
                    >
                      {t.stock.viewMovements}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <nav className="mt-6 flex items-center justify-between gap-4 text-sm">
        <span className="opacity-70">
          {interpolate(t.stock.count, { count: format.number(total) })} ·{" "}
          {interpolate(t.stock.page, { page: filters.page, pages })}
        </span>
        <div className="flex gap-3">
          {filters.page > 1 && (
            <Link
              href={`${PATH}${stockQuery(filters, filters.page - 1)}`}
              className={buttonClass("secondary")}
            >
              {t.stock.previous}
            </Link>
          )}
          {filters.page < pages && (
            <Link
              href={`${PATH}${stockQuery(filters, filters.page + 1)}`}
              className={buttonClass("secondary")}
            >
              {t.stock.next}
            </Link>
          )}
        </div>
      </nav>
    </>
  );
}

/** Productos con stock mínimo cargado cuyo saldo (total o del depósito) está por debajo. */
async function lowStockIds(stockWhere: { warehouseId?: string }) {
  const products = await db.product.findMany({
    where: { minStock: { not: null }, deletedAt: null },
    select: { id: true, minStock: true },
  });
  const sums = await db.productStock.groupBy({
    by: ["productId"],
    where: { ...stockWhere, productId: { in: products.map((p) => p.id) } },
    _sum: { quantity: true },
  });
  return products
    .filter((product) => {
      const sum = sums.find((row) => row.productId === product.id)?._sum
        .quantity;
      // Sin movimientos no hay fila de saldo: cuenta como 0.
      return toMilli(sum ?? 0) < toMilli(product.minStock!);
    })
    .map((product) => product.id);
}

/** Celda de cantidad: los negativos en rojo, para verlos de un vistazo. */
function Quantity({
  value,
  format,
  strong,
}: {
  value: { toString(): string } | number;
  format: (value: { toString(): string } | number) => string;
  strong?: boolean;
}) {
  const negative = toMilli(value) < BigInt(0);
  return (
    <td
      className={`py-2 pr-3 text-right font-mono whitespace-nowrap ${
        negative ? "text-red-600" : ""
      } ${strong ? "font-semibold" : ""}`}
    >
      {format(value)}
    </td>
  );
}

// Formulario GET: los filtros quedan en la URL, se pueden compartir y recargar.
function FiltersForm({
  t,
  filters,
  categories,
  warehouses,
}: {
  t: Dictionary["stock"];
  filters: StockFilters;
  categories: { id: number; label: string }[];
  warehouses: { id: string; name: string }[];
}) {
  const control = "rounded border border-current/20 bg-transparent px-3 py-2";

  return (
    <form
      action={PATH}
      className="mt-6 grid grid-cols-1 items-end gap-3 text-sm md:grid-cols-[2fr_1fr_1fr_1fr_auto]"
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
        <span className="font-medium">{t.warehouse}</span>
        <select
          name="warehouse"
          defaultValue={filters.warehouse ?? ""}
          className={control}
        >
          <option value="">{t.allWarehouses}</option>
          {warehouses.map((warehouse) => (
            <option key={warehouse.id} value={warehouse.id}>
              {warehouse.name}
            </option>
          ))}
        </select>
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
        <span className="font-medium">{t.level}</span>
        <select name="level" defaultValue={filters.level} className={control}>
          <option value="all">{t.levelAll}</option>
          <option value="out">{t.levelOut}</option>
          <option value="negative">{t.levelNegative}</option>
          <option value="low">{t.levelLow}</option>
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
