import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { buttonClass } from "@/components/ui/button";
import { getT } from "@/i18n/server";
import { getUserWithPermission } from "@/lib/auth";
import { db } from "@/lib/db";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.fleet.drivers };
}

export default async function DriversPage() {
  const t = await getT();

  return (
    <main className="mx-auto w-full max-w-4xl p-8">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{t.fleet.drivers}</h1>
        <Link href="/admin/drivers/new" className={buttonClass()}>
          {t.fleet.newDriver}
        </Link>
      </div>
      {/* La lista sale de la DB en cada request: va en Suspense. */}
      <Suspense
        fallback={<p className="mt-6 text-sm opacity-70">{t.common.loading}</p>}
      >
        <DriversTable />
      </Suspense>
    </main>
  );
}

async function DriversTable() {
  await getUserWithPermission("routes:manage");
  const t = await getT();
  const f = t.fleet;

  // Los activos primero.
  const drivers = await db.driver.findMany({
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    include: {
      user: {
        select: {
          userType: true,
          person: { select: { name: true, surname: true } },
        },
      },
    },
  });

  if (drivers.length === 0) {
    return <p className="mt-6 text-sm opacity-70">{f.driversEmpty}</p>;
  }

  return (
    <table className="mt-6 w-full text-left text-sm">
      <thead className="border-b border-current/20">
        <tr>
          <th className="py-2 pr-3 font-medium">{f.name}</th>
          <th className="py-2 pr-3 font-medium">{f.phone}</th>
          <th className="py-2 pr-3 font-medium">{f.user}</th>
          <th className="py-2 pr-3 font-medium">{t.warehouses.status}</th>
          <th className="py-2">
            <span className="sr-only">{t.common.actions}</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {drivers.map((driver) => (
          <tr
            key={driver.id}
            className={`border-b border-current/10 ${driver.isActive ? "" : "opacity-60"}`}
          >
            <td className="py-2 pr-3">{driver.name}</td>
            <td className="py-2 pr-3">{driver.phone ?? "—"}</td>
            <td className="py-2 pr-3">
              {driver.user
                ? `${driver.user.person.name} ${driver.user.person.surname} (${t.users.roles[driver.user.userType]})`
                : "—"}
            </td>
            <td className="py-2 pr-3">
              {driver.isActive ? f.active : f.inactive}
            </td>
            <td className="py-2 text-right">
              <Link
                href={`/admin/drivers/${driver.id}/edit`}
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
