import { notFound } from "next/navigation";
import { Suspense } from "react";
import { db } from "@/lib/db";
import { parseUnitId } from "@/lib/measurement-unit";
import { updateMeasurementUnit } from "../../actions";
import { MeasurementUnitForm } from "../../measurement-unit-form";

export default function EditMeasurementUnitPage({
  params,
}: PageProps<"/admin/measurement-units/[id]/edit">) {
  return (
    <main className="mx-auto w-full max-w-md p-8">
      <h1 className="text-2xl font-semibold">Editar unidad de medida</h1>
      {/* params y la query a la DB son de request: van en Suspense. */}
      <Suspense fallback={<p className="mt-6 text-sm opacity-70">Cargando…</p>}>
        <EditForm params={params} />
      </Suspense>
    </main>
  );
}

async function EditForm({ params }: { params: Promise<{ id: string }> }) {
  const unitId = parseUnitId((await params).id);
  if (unitId === null) notFound();

  const unit = await db.measurementUnit.findUnique({ where: { id: unitId } });
  if (!unit) notFound();

  return (
    <MeasurementUnitForm
      action={updateMeasurementUnit.bind(null, unit.id)}
      defaultValues={{ name: unit.name, description: unit.description ?? "" }}
      submitLabel="Guardar"
    />
  );
}
