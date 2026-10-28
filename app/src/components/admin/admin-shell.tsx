"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import { stripLocalePrefix } from "@/i18n/config";

export type NavItem = { href: string; label: string };
/** Sin `title` es un grupo sin encabezado (p. ej. "Inicio"). */
export type NavSection = { title?: string; items: NavItem[] };

type Props = {
  brand: string;
  sections: NavSection[];
  /** Usuario, tema y salir: va al pie del menú. */
  footer: ReactNode;
  labels: { openMenu: string; closeMenu: string };
  children: ReactNode;
};

// "/admin" solo se marca en el inicio exacto; el resto también en sus subpáginas.
function isActive(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminShell({
  brand,
  sections,
  footer,
  labels,
  children,
}: Props) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  // En mobile el menú es un panel: Escape lo cierra.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="flex flex-1 flex-col md:flex-row">
      {/* Barra superior, solo en pantallas chicas. */}
      <header className="flex items-center gap-3 border-b border-current/20 px-4 py-3 md:hidden print:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={labels.openMenu}
          aria-expanded={open}
          aria-controls="admin-sidebar"
          className="rounded px-2 py-1 text-lg leading-none hover:bg-current/10"
        >
          ☰
        </button>
        <Link href="/admin" className="font-semibold">
          {brand}
        </Link>
      </header>

      {open && (
        <div
          aria-hidden
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
        />
      )}

      <aside
        id="admin-sidebar"
        className={`bg-background fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-current/20 transition-transform md:sticky md:top-0 md:h-dvh md:translate-x-0 print:hidden ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-5 py-4">
          <Link href="/admin" onClick={close} className="font-semibold">
            {brand}
          </Link>
          <button
            type="button"
            onClick={close}
            aria-label={labels.closeMenu}
            className="rounded px-2 py-1 leading-none hover:bg-current/10 md:hidden"
          >
            ✕
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pb-4 text-sm">
          {/* La URL es dato del request: el resaltado del activo va en Suspense
              y, mientras tanto, el menú se ve igual pero sin marcar. */}
          <Suspense
            fallback={
              <NavList sections={sections} pathname={null} onNavigate={close} />
            }
          >
            <ActiveNavList sections={sections} onNavigate={close} />
          </Suspense>
        </nav>

        <div className="border-t border-current/20 px-5 py-4">{footer}</div>
      </aside>

      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function ActiveNavList(props: {
  sections: NavSection[];
  onNavigate: () => void;
}) {
  return <NavList {...props} pathname={stripLocalePrefix(usePathname())} />;
}

function NavList({
  sections,
  pathname,
  onNavigate,
}: {
  sections: NavSection[];
  pathname: string | null;
  onNavigate: () => void;
}) {
  return sections.map((section, index) => (
    <div key={section.title ?? index} className="mt-4 first:mt-0">
      {section.title && (
        <p className="px-2 pb-1 text-xs font-medium tracking-wide uppercase opacity-50">
          {section.title}
        </p>
      )}
      <ul>
        {section.items.map((item) => {
          const active = pathname !== null && isActive(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={`block rounded px-2 py-1.5 ${
                  active ? "bg-current/10 font-medium" : "hover:bg-current/5"
                }`}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  ));
}
