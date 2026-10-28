import type { Metadata } from "next";
import { Suspense } from "react";
import { DriverForm } from "@/components/fleet/fleet-forms";
import { getT } from "@/i18n/server";
import { getUserWithPermission } from "@/lib/auth";
import { saveDriver } from "../../fleet-actions";
import { getDriverUserOptions } from "../data";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.fleet.newDriver };
}

export default async function NewDriverPage() {
  const t = await getT();
  return (
    <main className="mx-auto w-full max-w-md p-8">
      <h1 className="text-2xl font-semibold">{t.fleet.newDriver}</h1>
      {/* Los usuarios salen de la DB: van en Suspense. */}
      <Suspense
        fallback={<p className="mt-6 text-sm opacity-70">{t.common.loading}</p>}
      >
        <NewDriver />
      </Suspense>
    </main>
  );
}

async function NewDriver() {
  await getUserWithPermission("routes:manage");
  const t = await getT();
  return (
    <DriverForm
      action={saveDriver.bind(null, null)}
      defaultValues={{ name: "", phone: "", userId: "", isActive: true }}
      users={await getDriverUserOptions(t.users.roles)}
      submitLabel={t.common.create}
      t={t.fleet}
      common={t.common}
    />
  );
}
