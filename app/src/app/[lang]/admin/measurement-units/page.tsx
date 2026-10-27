import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { buttonClass } from "@/components/ui/button";
import { interpolate } from "@/i18n/config";
import { getLocale, getT } from "@/i18n/server";
import { formatters } from "@/i18n/format";
import { getUserWithPermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { deleteMeasurementUnit } from "./actions";
import { DeleteMeasurementUnitButton } from "./delete-button";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.measurementUnits.title };
}

export default async function MeasurementUnitsPage() {
  const t = await getT();

  return (
    <main className="mx-auto w-full max-w-3xl p-8">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{t.measurementUnits.title}</h1>
        <Link href="/admin/measurement-units/new" className={buttonClass()}>
          {t.measurementUnits.newButton}
        </Link>
      </div>

      {/* La lista sale de la DB en cada request: va en Suspense (cacheComponents). */}
      <Suspense
        fallback={<p className="mt-6 text-sm opacity-70">{t.common.loading}</p>}
      >
        <MeasurementUnitsTable />
      </Suspense>
    </main>
  );
}

async function MeasurementUnitsTable() {
  await getUserWithPermission("measurement-units:manage");
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const format = formatters(locale);

  const units = await db.measurementUnit.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { products: true } } },
  });

  if (units.length === 0) {
    return (
      <p className="mt-6 text-sm opacity-70">{t.measurementUnits.empty}</p>
    );
  }

  return (
    <table className="mt-6 w-full text-left text-sm">
      <thead className="border-b border-current/20">
        <tr>
          <th className="py-2 font-medium">{t.measurementUnits.name}</th>
          <th className="py-2 font-medium">{t.measurementUnits.description}</th>
          <th className="py-2 text-right font-medium">
            {t.measurementUnits.products}
          </th>
          <th className="py-2">
            <span className="sr-only">{t.common.actions}</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {units.map((unit) => (
          <tr key={unit.id} className="border-b border-current/10 align-top">
            <td className="py-2 font-mono">{unit.name}</td>
            <td className="py-2">{unit.description ?? "—"}</td>
            <td className="py-2 text-right">
              {format.number(unit._count.products)}
            </td>
            <td className="py-2">
              <div className="flex items-start justify-end gap-4">
                <Link
                  href={`/admin/measurement-units/${unit.id}/edit`}
                  className="hover:underline"
                >
                  {t.common.edit}
                </Link>
                <DeleteMeasurementUnitButton
                  action={deleteMeasurementUnit.bind(null, unit.id)}
                  confirmMessage={interpolate(
                    t.measurementUnits.confirmDelete,
                    {
                      name: unit.name,
                    },
                  )}
                  labels={{
                    delete: t.common.delete,
                    deleting: t.common.deleting,
                  }}
                  disabledReason={
                    unit._count.products > 0
                      ? t.measurementUnits.hasProducts
                      : undefined
                  }
                />
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
