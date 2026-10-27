import Link from "next/link";
import { Suspense } from "react";
import { UserMenu } from "@/components/user-menu";

// Placeholder: se reemplaza por el catálogo en los issues de ALPHA.
export default function Home() {
  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <div className="text-center">
        <h1 className="text-2xl font-semibold">Onaks System</h1>
        <p className="mt-2 text-sm opacity-70">Proyecto inicializado.</p>
        <Link
          href="/admin/measurement-units"
          className="mt-4 inline-block text-sm underline"
        >
          Unidades de medida
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
