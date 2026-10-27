import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { buttonClass } from "@/components/ui/button";
import { DeleteButton } from "@/components/ui/delete-button";
import { interpolate } from "@/i18n/config";
import { getT } from "@/i18n/server";
import { getUserWithPermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { deleteWarehouse } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.warehouses.title };
}

export default async function WarehousesPage() {
  const t = await getT();

  return (
    <main className="mx-auto w-full max-w-4xl p-8">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{t.warehouses.title}</h1>
        <Link href="/admin/warehouses/new" className={buttonClass()}>
          {t.warehouses.newButton}
        </Link>
      </div>

      {/* La lista sale de la DB en cada request: va en Suspense (cacheComponents). */}
      <Suspense
        fallback={<p className="mt-6 text-sm opacity-70">{t.common.loading}</p>}
      >
        <WarehousesTable />
      </Suspense>
    </main>
  );
}

async function WarehousesTable() {
  await getUserWithPermission("warehouses:manage");
  const t = await getT();

  // Los activos primero.
  const warehouses = await db.warehouse.findMany({
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    include: { city: { select: { name: true } } },
  });

  if (warehouses.length === 0) {
    return <p className="mt-6 text-sm opacity-70">{t.warehouses.empty}</p>;
  }

  return (
    <table className="mt-6 w-full text-left text-sm">
      <thead className="border-b border-current/20">
        <tr>
          <th className="py-2 pr-3 font-medium">{t.warehouses.name}</th>
          <th className="py-2 pr-3 font-medium">{t.warehouses.address}</th>
          <th className="py-2 pr-3 font-medium">{t.warehouses.contact}</th>
          <th className="py-2 pr-3 font-medium">{t.warehouses.status}</th>
          <th className="py-2">
            <span className="sr-only">{t.common.actions}</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {warehouses.map((warehouse) => (
          <tr
            key={warehouse.id}
            className={`border-b border-current/10 align-top ${
              warehouse.isActive ? "" : "opacity-60"
            }`}
          >
            <td className="py-2 pr-3 font-medium">{warehouse.name}</td>
            <td className="py-2 pr-3">
              {warehouse.address}
              <span className="block text-xs opacity-70">
                {warehouse.city.name}
              </span>
            </td>
            <td className="py-2 pr-3">
              {warehouse.contactName ?? "—"}
              {warehouse.phone && (
                <span className="block text-xs opacity-70">
                  {warehouse.phone}
                </span>
              )}
            </td>
            <td className="py-2 pr-3">
              {warehouse.isActive ? t.warehouses.active : t.warehouses.inactive}
            </td>
            <td className="py-2">
              <div className="flex items-start justify-end gap-4">
                <Link
                  href={`/admin/warehouses/${warehouse.id}/edit`}
                  className="hover:underline"
                >
                  {t.common.edit}
                </Link>
                <DeleteButton
                  action={deleteWarehouse.bind(null, warehouse.id)}
                  confirmMessage={interpolate(t.warehouses.confirmDelete, {
                    name: warehouse.name,
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
  );
}
