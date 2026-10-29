import type { Metadata } from "next";
import { getT } from "@/i18n/server";
import { createState } from "../../actions";
import { LocationForm } from "../../location-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.locations.newStateTitle };
}

export default async function NewStatePage() {
  const t = await getT();

  return (
    <main className="mx-auto w-full max-w-md p-4 sm:p-8">
      <h1 className="text-2xl font-semibold">{t.locations.newStateTitle}</h1>
      <LocationForm
        action={createState}
        defaultValues={{ name: "" }}
        placeholder={t.locations.statePlaceholder}
        submitLabel={t.common.create}
        t={t.locations}
        common={t.common}
      />
    </main>
  );
}
