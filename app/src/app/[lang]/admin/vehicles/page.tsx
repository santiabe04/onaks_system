import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { buttonClass } from "@/components/ui/button";
import { interpolate } from "@/i18n/config";
import { formatters } from "@/i18n/format";
import { getLocale, getT } from "@/i18n/server";
import { getUserWithPermission } from "@/lib/auth";
import { db } from "@/lib/db";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.fleet.vehicles };
}

export default async function VehiclesPage() {
  const t = await getT();

  return (
    <main className="mx-auto w-full max-w-4xl p-8">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{t.fleet.vehicles}</h1>
        <Link href="/admin/vehicles/new" className={buttonClass()}>
          {t.fleet.newVehicle}
        </Link>
      </div>
      {/* La lista sale de la DB en cada request: va en Suspense. */}
      <Suspense
        fallback={<p className="mt-6 text-sm opacity-70">{t.common.loading}</p>}
      >
        <VehiclesTable />
      </Suspense>
    </main>
  );
}

async function VehiclesTable() {
  await getUserWithPermission("routes:manage");
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const format = formatters(locale);
  const f = t.fleet;

  // Los activos primero.
  const vehicles = await db.vehicle.findMany({
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
  });

  if (vehicles.length === 0) {
    return <p className="mt-6 text-sm opacity-70">{f.vehiclesEmpty}</p>;
  }

  return (
    <table className="mt-6 w-full text-left text-sm">
      <thead className="border-b border-current/20">
        <tr>
          <th className="py-2 pr-3 font-medium">{f.vehicleName}</th>
          <th className="py-2 pr-3 font-medium">{f.plate}</th>
          <th className="py-2 pr-3 font-medium">{f.capacity}</th>
          <th className="py-2 pr-3 font-medium">{t.warehouses.status}</th>
          <th className="py-2">
            <span className="sr-only">{t.common.actions}</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {vehicles.map((vehicle) => (
          <tr
            key={vehicle.id}
            className={`border-b border-current/10 ${vehicle.isActive ? "" : "opacity-60"}`}
          >
            <td className="py-2 pr-3">{vehicle.name}</td>
            <td className="py-2 pr-3 font-mono">{vehicle.plate ?? "—"}</td>
            <td className="py-2 pr-3">
              {[
                vehicle.capacityKg &&
                  interpolate(t.adminOrders.kg, {
                    value: format.number(vehicle.capacityKg),
                  }),
                vehicle.capacityLiters &&
                  interpolate(t.adminOrders.liters, {
                    value: format.number(vehicle.capacityLiters),
                  }),
              ]
                .filter(Boolean)
                .join(" · ") || "—"}
            </td>
            <td className="py-2 pr-3">
              {vehicle.isActive ? f.active : f.inactive}
            </td>
            <td className="py-2 text-right">
              <Link
                href={`/admin/vehicles/${vehicle.id}/edit`}
                className="hover:underline"
              >
                {t.common.edit}
              </Link>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
