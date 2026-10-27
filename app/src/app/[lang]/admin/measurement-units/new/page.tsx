import type { Metadata } from "next";
import { getT } from "@/i18n/server";
import { createMeasurementUnit } from "../actions";
import { MeasurementUnitForm } from "../measurement-unit-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.measurementUnits.newTitle };
}

export default async function NewMeasurementUnitPage() {
  const t = await getT();

  return (
    <main className="mx-auto w-full max-w-md p-8">
      <h1 className="text-2xl font-semibold">{t.measurementUnits.newTitle}</h1>
      <MeasurementUnitForm
        action={createMeasurementUnit}
        submitLabel={t.common.create}
        t={t.measurementUnits}
        common={t.common}
      />
    </main>
  );
}
