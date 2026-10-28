import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getT } from "@/i18n/server";
import { getUserWithPermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { parseUnitId } from "@/lib/measurement-unit";
import { updateMeasurementUnit } from "../../actions";
import { MeasurementUnitForm } from "../../measurement-unit-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.measurementUnits.editTitle };
}

export default async function EditMeasurementUnitPage({
  params,
}: PageProps<"/[lang]/admin/measurement-units/[id]/edit">) {
  const t = await getT();

  return (
    <main className="mx-auto w-full max-w-md p-8">
      <h1 className="text-2xl font-semibold">{t.measurementUnits.editTitle}</h1>
      {/* params y la query a la DB son de request: van en Suspense. */}
      <Suspense
        fallback={<p className="mt-6 text-sm opacity-70">{t.common.loading}</p>}
      >
        <EditForm params={params} />
      </Suspense>
    </main>
  );
}

async function EditForm({ params }: { params: Promise<{ id: string }> }) {
  await getUserWithPermission("measurement-units:manage");
  const t = await getT();

  const unitId = parseUnitId((await params).id);
  if (unitId === null) notFound();

  const unit = await db.measurementUnit.findUnique({ where: { id: unitId } });
  if (!unit) notFound();

  return (
    <MeasurementUnitForm
      action={updateMeasurementUnit.bind(null, unit.id)}
      defaultValues={{
        name: unit.name,
        description: unit.description ?? "",
        allowsDecimals: unit.allowsDecimals,
      }}
      submitLabel={t.common.save}
      t={t.measurementUnits}
      common={t.common}
    />
  );
}
