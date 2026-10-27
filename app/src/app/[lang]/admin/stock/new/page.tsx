import type { Metadata } from "next";
import { Suspense } from "react";
import { interpolate } from "@/i18n/config";
import { formatters } from "@/i18n/format";
import { getLocale, getT } from "@/i18n/server";
import { getUserWithPermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { isCuid } from "@/lib/ids";
import { MovementForm } from "../movement-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.stock.movementTitle };
}

export default async function NewMovementPage({
  searchParams,
}: PageProps<"/[lang]/admin/stock/new">) {
  const t = await getT();

  return (
    <main className="mx-auto w-full max-w-xl p-8">
      <h1 className="text-2xl font-semibold">{t.stock.movementTitle}</h1>
      {/* Las opciones salen de la DB y `?product=` de la URL. */}
      <Suspense
        fallback={<p className="mt-6 text-sm opacity-70">{t.common.loading}</p>}
      >
        <NewMovement searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function NewMovement({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await getUserWithPermission("stock:manage");
  const [t, locale] = await Promise.all([getT(), getLocale()]);

  const [products, warehouses] = await Promise.all([
    db.product.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, sku: true, isActive: true },
    }),
    db.warehouse.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  if (warehouses.length === 0) {
    return <p className="mt-6 text-sm">{t.stock.noWarehouses}</p>;
  }

  // "Registrar movimiento" desde un producto llega con ?product=ID.
  const requested = (await searchParams).product;
  const productId =
    typeof requested === "string" &&
    isCuid(requested) &&
    products.some((p) => p.id === requested)
      ? requested
      : "";

  // Con el producto elegido se muestran sus saldos: útil para el ajuste.
  const balances = productId
    ? await db.productStock.findMany({
        where: { productId, warehouse: { isActive: true } },
        include: { warehouse: { select: { name: true } } },
        orderBy: { warehouse: { name: "asc" } },
      })
    : [];
  const format = formatters(locale);

  return (
    <MovementForm
      defaultValues={{
        type: "ENTRY",
        productId,
        warehouseId: warehouses.length === 1 ? warehouses[0].id : "",
        toWarehouseId: "",
        quantity: "",
        comment: "",
      }}
      products={products.map((p) => ({
        id: p.id,
        label: `${p.name} (${p.sku})${p.isActive ? "" : ` · ${t.stock.paused}`}`,
      }))}
      warehouses={warehouses.map((w) => ({ id: w.id, label: w.name }))}
      balances={
        balances.length > 0
          ? interpolate(t.stock.currentBalances, {
              balances: balances
                .map((b) => `${b.warehouse.name}: ${format.number(b.quantity)}`)
                .join(" · "),
            })
          : undefined
      }
      cancelHref={productId ? `/admin/stock/${productId}` : "/admin/stock"}
      t={t.stock}
      common={t.common}
    />
  );
}
