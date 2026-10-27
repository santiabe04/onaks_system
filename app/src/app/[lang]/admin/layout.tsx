import Link from "next/link";
import { Suspense } from "react";
import { UserMenu } from "@/components/user-menu";
import { ADMIN_BRAND } from "@/lib/app";

export default function AdminLayout({
  children,
}: LayoutProps<"/[lang]/admin">) {
  return (
    <>
      <header className="border-b border-current/20">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-4 px-8 py-3">
          <Link href="/admin/measurement-units" className="font-semibold">
            {ADMIN_BRAND}
          </Link>
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
