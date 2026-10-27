import Link from "next/link";
import { Suspense } from "react";
import { getUserWithPermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { deleteMeasurementUnit } from "./actions";
import { DeleteMeasurementUnitButton } from "./delete-button";

export default function MeasurementUnitsPage() {
  return (
    <main className="mx-auto w-full max-w-3xl p-8">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Unidades de medida</h1>
        <Link
          href="/admin/measurement-units/new"
          className="bg-foreground text-background rounded px-4 py-2 text-sm font-medium"
        >
          Nueva unidad
        </Link>
      </div>

      {/* La lista sale de la DB en cada request: va en Suspense (cacheComponents). */}
      <Suspense fallback={<p className="mt-6 text-sm opacity-70">Cargando…</p>}>
        <MeasurementUnitsTable />
      </Suspense>
    </main>
  );
}

async function MeasurementUnitsTable() {
  await getUserWithPermission("measurement-units:manage");

  const units = await db.measurementUnit.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { products: true } } },
  });

  if (units.length === 0) {
    return <p className="mt-6 text-sm opacity-70">No hay unidades cargadas.</p>;
  }

  return (
    <table className="mt-6 w-full text-left text-sm">
      <thead className="border-b border-current/20">
        <tr>
          <th className="py-2 font-medium">Nombre</th>
          <th className="py-2 font-medium">Descripción</th>
          <th className="py-2 text-right font-medium">Productos</th>
          <th className="py-2">
            <span className="sr-only">Acciones</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {units.map((unit) => (
          <tr key={unit.id} className="border-b border-current/10 align-top">
            <td className="py-2 font-mono">{unit.name}</td>
            <td className="py-2">{unit.description ?? "—"}</td>
            <td className="py-2 text-right">{unit._count.products}</td>
            <td className="py-2">
              <div className="flex items-start justify-end gap-4">
                <Link
                  href={`/admin/measurement-units/${unit.id}/edit`}
                  className="hover:underline"
                >
                  Editar
                </Link>
                <DeleteMeasurementUnitButton
                  action={deleteMeasurementUnit.bind(null, unit.id)}
                  name={unit.name}
                  disabledReason={
                    unit._count.products > 0
                      ? "Tiene productos asociados"
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
