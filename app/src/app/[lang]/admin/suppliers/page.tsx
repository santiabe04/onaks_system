import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { buttonClass } from "@/components/ui/button";
import type { Prisma } from "@/generated/prisma/client";
import { getT } from "@/i18n/server";
import { getUserWithPermission } from "@/lib/auth";
import { formatCuit, normalizeCuit } from "@/lib/cuit";
import { db } from "@/lib/db";

const PATH = "/admin/suppliers";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.suppliers.title };
}

export default async function SuppliersPage({
  searchParams,
}: PageProps<"/[lang]/admin/suppliers">) {
  const t = await getT();

  return (
    <main className="mx-auto w-full max-w-5xl p-4 sm:p-8">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{t.suppliers.title}</h1>
        <Link href={`${PATH}/new`} className={buttonClass()}>
          {t.suppliers.newButton}
        </Link>
      </div>

      {/* La búsqueda viene de la URL y la lista de la DB: van en Suspense. */}
      <Suspense
        fallback={<p className="mt-6 text-sm opacity-70">{t.common.loading}</p>}
      >
        <SuppliersTable searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function SuppliersTable({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await getUserWithPermission("suppliers:manage");
  const t = await getT();

  const raw = (await searchParams).q;
  const q = (Array.isArray(raw) ? raw[0] : raw)?.trim().slice(0, 100) || "";
  // Busca por nombre o por CUIT (con o sin guiones).
  const contains = { contains: q, mode: "insensitive" as const };
  const where: Prisma.SupplierWhereInput = q
    ? {
        OR: [
          { legalName: contains },
          { tradeName: contains },
          ...(normalizeCuit(q)
            ? [{ cuit: { contains: normalizeCuit(q) } }]
            : []),
        ],
      }
    : {};

  // Los proveedores son pocos: sin paginación.
  const suppliers = await db.supplier.findMany({
    where,
    orderBy: [{ isActive: "desc" }, { legalName: "asc" }],
    include: { _count: { select: { products: true } } },
  });

  return (
    <>
      <form action={PATH} className="mt-6 flex gap-3 text-sm">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder={t.suppliers.searchPlaceholder}
          aria-label={t.suppliers.search}
          className="w-full max-w-sm rounded border border-current/20 bg-transparent px-3 py-2"
        />
        <button type="submit" className={buttonClass()}>
          {t.suppliers.filter}
        </button>
        {q && (
          <Link href={PATH} className={buttonClass("secondary")}>
            {t.suppliers.clear}
          </Link>
        )}
      </form>

      {suppliers.length === 0 ? (
        <p className="mt-6 text-sm opacity-70">{t.suppliers.empty}</p>
      ) : (
        <div className="overflow-x-auto print:overflow-visible">
          <table className="mt-6 w-full text-left text-sm">
            <thead className="border-b border-current/20">
              <tr>
                <th className="py-2 pr-3 font-medium">
                  {t.suppliers.legalName}
                </th>
                <th className="py-2 pr-3 font-medium">{t.suppliers.cuit}</th>
                <th className="py-2 pr-3 font-medium">{t.suppliers.contact}</th>
                <th className="py-2 pr-3 text-right font-medium">
                  {t.suppliers.products}
                </th>
                <th className="py-2 pr-3 font-medium">{t.suppliers.status}</th>
              </tr>
            </thead>
            <tbody>
              {suppliers.map((supplier) => (
                <tr
                  key={supplier.id}
                  className={`border-b border-current/10 align-top ${
                    supplier.isActive ? "" : "opacity-60"
                  }`}
                >
                  <td className="py-2 pr-3">
                    <Link
                      href={`${PATH}/${supplier.id}`}
                      className="font-medium hover:underline"
                    >
                      {supplier.legalName}
                    </Link>
                    {supplier.tradeName && (
                      <span className="block text-xs opacity-70">
                        {supplier.tradeName}
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-3 font-mono whitespace-nowrap">
                    {formatCuit(supplier.cuit)}
                  </td>
                  <td className="py-2 pr-3">
                    {supplier.contactName ?? "—"}
                    {(supplier.contactMail || supplier.contactPhone) && (
                      <span className="block text-xs opacity-70">
                        {[supplier.contactMail, supplier.contactPhone]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-right">
                    {supplier._count.products}
                  </td>
                  <td className="py-2 pr-3">
                    {supplier.isActive
                      ? t.suppliers.active
                      : t.suppliers.inactive}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
