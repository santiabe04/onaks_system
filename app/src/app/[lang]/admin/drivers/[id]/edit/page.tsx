import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { DriverForm } from "@/components/fleet/fleet-forms";
import { getT } from "@/i18n/server";
import { getUserWithPermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { isCuid } from "@/lib/ids";
import { saveDriver } from "../../../fleet-actions";
import { getDriverUserOptions } from "../../data";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.fleet.editDriver };
}

export default async function EditDriverPage({
  params,
}: PageProps<"/[lang]/admin/drivers/[id]/edit">) {
  const t = await getT();
  return (
    <main className="mx-auto w-full max-w-md p-8">
      <h1 className="text-2xl font-semibold">{t.fleet.editDriver}</h1>
      {/* params y la query a la DB son de request: van en Suspense. */}
      <Suspense
        fallback={<p className="mt-6 text-sm opacity-70">{t.common.loading}</p>}
      >
        <EditDriver params={params} />
      </Suspense>
    </main>
  );
}

async function EditDriver({ params }: { params: Promise<{ id: string }> }) {
  await getUserWithPermission("routes:manage");
  const t = await getT();
  const { id } = await params;
  if (!isCuid(id)) notFound();
  const driver = await db.driver.findUnique({ where: { id } });
  if (!driver) notFound();

  return (
    <DriverForm
      action={saveDriver.bind(null, driver.id)}
      defaultValues={{
        name: driver.name,
        phone: driver.phone ?? "",
        userId: driver.userId ?? "",
        isActive: driver.isActive,
      }}
      users={await getDriverUserOptions(t.users.roles, driver.userId)}
      submitLabel={t.common.save}
      t={t.fleet}
      common={t.common}
    />
  );
}
