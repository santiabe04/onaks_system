import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { VehicleForm } from "@/components/fleet/fleet-forms";
import { formatters } from "@/i18n/format";
import { getLocale, getT } from "@/i18n/server";
import { getUserWithPermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { isCuid } from "@/lib/ids";
import { saveVehicle } from "../../../fleet-actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.fleet.editVehicle };
}

export default async function EditVehiclePage({
  params,
}: PageProps<"/[lang]/admin/vehicles/[id]/edit">) {
  const t = await getT();
  return (
    <main className="mx-auto w-full max-w-md p-4 sm:p-8">
      <h1 className="text-2xl font-semibold">{t.fleet.editVehicle}</h1>
      {/* params y la query a la DB son de request: van en Suspense. */}
      <Suspense
        fallback={<p className="mt-6 text-sm opacity-70">{t.common.loading}</p>}
      >
        <EditVehicle params={params} />
      </Suspense>
    </main>
  );
}

async function EditVehicle({ params }: { params: Promise<{ id: string }> }) {
  await getUserWithPermission("routes:manage");
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const format = formatters(locale);
  const { id } = await params;
  if (!isCuid(id)) notFound();
  const vehicle = await db.vehicle.findUnique({ where: { id } });
  if (!vehicle) notFound();

  return (
    <VehicleForm
      action={saveVehicle.bind(null, vehicle.id)}
      defaultValues={{
        name: vehicle.name,
        plate: vehicle.plate ?? "",
        // Con el separador decimal del idioma.
        capacityKg: vehicle.capacityKg ? format.input(vehicle.capacityKg) : "",
        capacityLiters: vehicle.capacityLiters
          ? format.input(vehicle.capacityLiters)
          : "",
        isActive: vehicle.isActive,
      }}
      submitLabel={t.common.save}
      t={t.fleet}
      common={t.common}
    />
  );
}
