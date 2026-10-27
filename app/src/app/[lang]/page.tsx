import Link from "next/link";
import { Suspense } from "react";
import { UserMenu } from "@/components/user-menu";
import { getT } from "@/i18n/server";
import { APP_NAME } from "@/lib/app";

// Placeholder: se reemplaza por el catálogo en los issues de ALPHA.
export default async function Home() {
  const t = await getT();

  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <div className="text-center">
        <h1 className="text-2xl font-semibold">{APP_NAME}</h1>
        <p className="mt-2 text-sm opacity-70">{t.home.subtitle}</p>
        <Link
          href="/admin/measurement-units"
          className="mt-4 inline-block text-sm underline"
        >
          {t.home.measurementUnits}
        </Link>
        <div className="mt-6 flex justify-center">
          <Suspense fallback={null}>
            <UserMenu />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
