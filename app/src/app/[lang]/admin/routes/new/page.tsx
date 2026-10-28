import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { RouteSheetForm } from "@/components/routes/route-forms";
import { getT } from "@/i18n/server";
import { getUserWithPermission } from "@/lib/auth";
import { isoDay } from "@/lib/order-period";
import { getFleetOptions } from "@/lib/route-sheet-queries";
import { createRouteSheet } from "../actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.routes.newTitle };
}

export default async function NewRouteSheetPage() {
  const t = await getT();
  return (
    <main className="mx-auto w-full max-w-3xl p-8">
      <h1 className="mb-6 text-2xl font-semibold">{t.routes.newTitle}</h1>
      {/* Repartidores y vehículos salen de la DB: van en Suspense. */}
      <Suspense
        fallback={<p className="text-sm opacity-70">{t.common.loading}</p>}
      >
        <NewRouteSheet />
      </Suspense>
    </main>
  );
}

async function NewRouteSheet() {
  await getUserWithPermission("routes:manage");
  const t = await getT();
  const options = await getFleetOptions();
  // Por defecto, hoy (el día del request).
  await connection();
  return (
    <RouteSheetForm
      action={createRouteSheet}
      defaultValues={{
        date: isoDay(new Date()),
        driverId: options.drivers.length === 1 ? options.drivers[0].id : "",
        vehicleId: "",
        notes: "",
      }}
      options={options}
      submitLabel={t.routes.create}
      cancelHref="/admin/routes"
      t={t.routes}
      common={t.common}
    />
  );
}
