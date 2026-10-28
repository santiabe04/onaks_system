import type { Metadata } from "next";
import { Suspense } from "react";
import { getT } from "@/i18n/server";
import { getUserWithPermission } from "@/lib/auth";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.delivery.title };
}

// Por ahora solo el inicio: las hojas de ruta y la carga por parada llegan
// con las próximas etapas.
export default async function DeliveryPage() {
  const t = await getT();

  return (
    <main className="mx-auto w-full max-w-3xl p-4">
      <h1 className="text-2xl font-semibold">{t.delivery.title}</h1>
      <Suspense
        fallback={<p className="mt-6 text-sm opacity-70">{t.common.loading}</p>}
      >
        <Deliveries />
      </Suspense>
    </main>
  );
}

async function Deliveries() {
  await getUserWithPermission("routes:deliver");
  const t = await getT();
  return <p className="mt-6 text-sm opacity-70">{t.delivery.empty}</p>;
}
