import Link from "next/link";
import { Suspense } from "react";
import { UserMenu } from "@/components/user-menu";
import { getT } from "@/i18n/server";
import { ADMIN_BRAND } from "@/lib/app";

// Navegación provisoria: en la fase 0.4 pasa a un menú lateral.
export default async function AdminLayout({
  children,
}: LayoutProps<"/[lang]/admin">) {
  const t = await getT();

  return (
    <>
      <header className="border-b border-current/20">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-8 py-3">
          <nav className="flex items-center gap-6 text-sm">
            <Link href="/admin/measurement-units" className="font-semibold">
              {ADMIN_BRAND}
            </Link>
            <Link href="/admin/measurement-units" className="hover:underline">
              {t.adminNav.measurementUnits}
            </Link>
            <Link href="/admin/audit" className="hover:underline">
              {t.adminNav.audit}
            </Link>
          </nav>
          {/* La sesión no se lee en el layout: se empuja a un hijo en Suspense. */}
          <Suspense fallback={null}>
            <UserMenu role="ADMIN" />
          </Suspense>
        </div>
      </header>
      {children}
    </>
  );
}
