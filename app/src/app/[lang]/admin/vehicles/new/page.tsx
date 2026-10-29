import type { Metadata } from "next";
import { Suspense } from "react";
import { VehicleForm } from "@/components/fleet/fleet-forms";
import { getT } from "@/i18n/server";
import { getUserWithPermission } from "@/lib/auth";
import { saveVehicle } from "../../fleet-actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.fleet.newVehicle };
}

export default async function NewVehiclePage() {
  const t = await getT();
  return (
    <main className="mx-auto w-full max-w-md p-4 sm:p-8">
      <h1 className="text-2xl font-semibold">{t.fleet.newVehicle}</h1>
      {/* El permiso es de request: va en Suspense. */}
      <Suspense
        fallback={<p className="mt-6 text-sm opacity-70">{t.common.loading}</p>}
      >
        <NewVehicle />
      </Suspense>
    </main>
  );
}

async function NewVehicle() {
  await getUserWithPermission("routes:manage");
  const t = await getT();
  return (
    <VehicleForm
      action={saveVehicle.bind(null, null)}
      defaultValues={{
        name: "",
        plate: "",
        capacityKg: "",
        capacityLiters: "",
        isActive: true,
      }}
      submitLabel={t.common.create}
      t={t.fleet}
      common={t.common}
    />
  );
}
