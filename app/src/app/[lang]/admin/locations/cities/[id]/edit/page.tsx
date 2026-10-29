import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getT } from "@/i18n/server";
import { getUserWithPermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { parseLocationId } from "@/lib/location";
import { updateCity } from "../../../actions";
import { LocationForm } from "../../../location-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.locations.editCityTitle };
}

export default async function EditCityPage({
  params,
}: PageProps<"/[lang]/admin/locations/cities/[id]/edit">) {
  const t = await getT();

  return (
    <main className="mx-auto w-full max-w-md p-4 sm:p-8">
      <h1 className="text-2xl font-semibold">{t.locations.editCityTitle}</h1>
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
  await getUserWithPermission("locations:manage");
  const t = await getT();

  const cityId = parseLocationId((await params).id);
  if (cityId === null) notFound();
  const [city, states] = await Promise.all([
    db.city.findUnique({ where: { id: cityId } }),
    db.state.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);
  if (!city) notFound();

  return (
    <LocationForm
      action={updateCity.bind(null, city.id)}
      defaultValues={{ name: city.name, stateId: String(city.stateId) }}
      states={states}
      placeholder={t.locations.cityPlaceholder}
      submitLabel={t.common.save}
      t={t.locations}
      common={t.common}
    />
  );
}
