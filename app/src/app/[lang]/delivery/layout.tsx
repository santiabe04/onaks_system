import Link from "next/link";
import { Suspense } from "react";
import { ThemeSelector } from "@/components/theme-selector";
import { UserMenu } from "@/components/user-menu";
import { getT } from "@/i18n/server";
import { APP_NAME } from "@/lib/app";
import { DELIVERY_PATH } from "@/lib/routes";

// Lo que ve el repartidor desde el celular: sus hojas de ruta. Los admins que
// también reparten entran igual.
export default async function DeliveryLayout({
  children,
}: LayoutProps<"/[lang]/delivery">) {
  const t = await getT();

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-current/20">
        <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3">
          <Link href={DELIVERY_PATH} className="font-semibold">
            {APP_NAME}
          </Link>
          {/* La sesión no se lee en el layout: se empuja a hijos en Suspense. */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <Suspense fallback={null}>
              <UserMenu />
            </Suspense>
            <ThemeSelector labels={t.theme} />
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
