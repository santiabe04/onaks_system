import type { Metadata } from "next";
import { Suspense } from "react";
import { getT } from "@/i18n/server";
import { getUserWithPermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { parseLocationId } from "@/lib/location";
import { createCity } from "../../actions";
import { LocationForm } from "../../location-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.locations.newCityTitle };
}

export default async function NewCityPage({
  searchParams,
}: PageProps<"/[lang]/admin/locations/cities/new">) {
  const t = await getT();

  return (
    <main className="mx-auto w-full max-w-md p-4 sm:p-8">
      <h1 className="text-2xl font-semibold">{t.locations.newCityTitle}</h1>
      {/* Las provincias salen de la DB y `?state=` de la URL. */}
      <Suspense
        fallback={<p className="mt-6 text-sm opacity-70">{t.common.loading}</p>}
      >
        <NewForm searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function NewForm({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await getUserWithPermission("locations:manage");
  const t = await getT();

  const states = await db.state.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  // "Agregar localidad" desde una provincia llega con ?state=ID.
  const requested = parseLocationId((await searchParams).state);
  const stateId = states.some((s) => s.id === requested)
    ? String(requested)
    : "";

  return (
    <LocationForm
      action={createCity}
      defaultValues={{ name: "", stateId }}
      states={states}
      placeholder={t.locations.cityPlaceholder}
      submitLabel={t.common.create}
      t={t.locations}
      common={t.common}
    />
  );
}
