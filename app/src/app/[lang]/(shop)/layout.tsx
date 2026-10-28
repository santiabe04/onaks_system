import Link from "next/link";
import { Suspense } from "react";
import { ThemeSelector } from "@/components/theme-selector";
import { UserMenu } from "@/components/user-menu";
import { getT } from "@/i18n/server";
import { APP_NAME } from "@/lib/app";
import { getCurrentUser } from "@/lib/auth";
import { VISIBLE_PRODUCT } from "@/lib/catalog";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { interpolate } from "@/i18n/config";

// La tienda que ven los clientes (catálogo, carrito y pedidos). Los
// admins también pueden entrar, para ver lo mismo que el cliente.
export default async function ShopLayout({ children }: LayoutProps<"/[lang]">) {
  const t = await getT();

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-current/20">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3 sm:px-8">
          <Link href="/" className="font-semibold">
            {APP_NAME}
          </Link>
          {/* La sesión no se lee en el layout: se empuja a hijos en Suspense. */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <Suspense fallback={null}>
              <AdminLink label={t.catalog.adminPanel} />
            </Suspense>
            <Suspense fallback={null}>
              <BuyerLinks cart={t.cart.link} orders={t.orders.title} />
            </Suspense>
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

/**
 * "Mis pedidos" y "Carrito (N)" para los clientes. El carrito cuenta solo
 * productos que se siguen vendiendo.
 */
async function BuyerLinks({ cart, orders }: { cart: string; orders: string }) {
  const user = await getCurrentUser();
  if (!can(user.role, "sales:create")) return null;
  const count = await db.cartItem.count({
    where: { personId: user.personId, product: VISIBLE_PRODUCT },
  });
  return (
    <>
      <Link href="/orders" className="text-sm hover:underline">
        {orders}
      </Link>
      <Link href="/cart" className="text-sm font-medium hover:underline">
        {interpolate(cart, { count })}
      </Link>
    </>
  );
}

/** Acceso al panel, solo para admins. */
async function AdminLink({ label }: { label: string }) {
  const user = await getCurrentUser();
  if (user.role !== "ADMIN") return null;
  return (
    <Link href="/admin" className="text-sm hover:underline">
      {label}
    </Link>
  );
}
