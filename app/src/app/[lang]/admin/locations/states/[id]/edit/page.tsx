import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getT } from "@/i18n/server";
import { getUserWithPermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { parseLocationId } from "@/lib/location";
import { updateState } from "../../../actions";
import { LocationForm } from "../../../location-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.locations.editStateTitle };
}

export default async function EditStatePage({
  params,
}: PageProps<"/[lang]/admin/locations/states/[id]/edit">) {
  const t = await getT();

  return (
    <main className="mx-auto w-full max-w-md p-8">
      <h1 className="text-2xl font-semibold">{t.locations.editStateTitle}</h1>
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

  const stateId = parseLocationId((await params).id);
  if (stateId === null) notFound();
  const state = await db.state.findUnique({ where: { id: stateId } });
  if (!state) notFound();

  return (
    <LocationForm
      action={updateState.bind(null, state.id)}
      defaultValues={{ name: state.name }}
      placeholder={t.locations.statePlaceholder}
      submitLabel={t.common.save}
      t={t.locations}
      common={t.common}
    />
  );
}
