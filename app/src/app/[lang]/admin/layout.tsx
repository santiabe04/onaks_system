import { Suspense } from "react";
import { AdminShell, type NavSection } from "@/components/admin/admin-shell";
import { SidebarUser } from "@/components/admin/sidebar-user";
import { ThemeSelector } from "@/components/theme-selector";
import { getT } from "@/i18n/server";
import { ADMIN_BRAND } from "@/lib/app";

export default async function AdminLayout({
  children,
}: LayoutProps<"/[lang]/admin">) {
  const t = await getT();

  // Un grupo aparece cuando existe alguna de sus pantallas: Clientes, Pedidos
  // y Compras se suman en sus fases.
  const sections: NavSection[] = [
    { items: [{ href: "/admin", label: t.adminNav.home }] },
    {
      title: t.adminNav.catalog,
      items: [
        { href: "/admin/products", label: t.adminNav.products },
        { href: "/admin/stock", label: t.adminNav.stock },
        { href: "/admin/categories", label: t.adminNav.categories },
        { href: "/admin/warehouses", label: t.adminNav.warehouses },
        { href: "/admin/tax-rates", label: t.adminNav.taxRates },
        {
          href: "/admin/measurement-units",
          label: t.adminNav.measurementUnits,
        },
      ],
    },
    {
      title: t.adminNav.customers,
      items: [
        { href: "/admin/customers", label: t.customers.title },
        { href: "/admin/locations", label: t.adminNav.locations },
      ],
    },
    {
      title: t.adminNav.purchases,
      items: [{ href: "/admin/suppliers", label: t.adminNav.suppliers }],
    },
    {
      title: t.adminNav.system,
      items: [{ href: "/admin/audit", label: t.adminNav.audit }],
    },
  ];

  return (
    <AdminShell
      brand={ADMIN_BRAND}
      sections={sections}
      labels={{
        openMenu: t.adminNav.openMenu,
        closeMenu: t.adminNav.closeMenu,
      }}
      footer={
        <div className="flex flex-col gap-3">
          {/* La sesión no se lee en el layout: se empuja a un hijo en Suspense. */}
          <Suspense fallback={null}>
            <SidebarUser />
          </Suspense>
          <ThemeSelector labels={t.theme} />
        </div>
      }
    >
      {children}
    </AdminShell>
  );
}
