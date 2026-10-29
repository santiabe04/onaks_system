import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { buttonClass } from "@/components/ui/button";
import type { Prisma } from "@/generated/prisma/client";
import { interpolate } from "@/i18n/config";
import { formatters } from "@/i18n/format";
import { getLocale, getT } from "@/i18n/server";
import { getUserWithPermission } from "@/lib/auth";
import { formatCuit, normalizeCuit } from "@/lib/cuit";
import { db } from "@/lib/db";
import { parsePage } from "@/lib/stock-filters";

const PATH = "/admin/customers";
const PAGE_SIZE = 50;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.customers.title };
}

export default async function CustomersPage({
  searchParams,
}: PageProps<"/[lang]/admin/customers">) {
  const t = await getT();

  return (
    <main className="mx-auto w-full max-w-5xl p-4 sm:p-8">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{t.customers.title}</h1>
        <Link href={`${PATH}/new`} className={buttonClass()}>
          {t.customers.newButton}
        </Link>
      </div>

      {/* La búsqueda viene de la URL y la lista de la DB: van en Suspense. */}
      <Suspense
        fallback={<p className="mt-6 text-sm opacity-70">{t.common.loading}</p>}
      >
        <CustomersTable searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function CustomersTable({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await getUserWithPermission("customers:manage");
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const format = formatters(locale);

  const params = await searchParams;
  const raw = Array.isArray(params.q) ? params.q[0] : params.q;
  const q = raw?.trim().slice(0, 100) || "";
  const page = parsePage(params);

  // Busca por nombre, razón social o CUIT (con o sin guiones).
  const contains = { contains: q, mode: "insensitive" as const };
  const where: Prisma.CustomerWhereInput = {
    deletedAt: null,
    OR: q
      ? [
          { tradeName: contains },
          { legalName: contains },
          ...(normalizeCuit(q)
            ? [{ cuit: { contains: normalizeCuit(q) } }]
            : []),
        ]
      : undefined,
  };

  const [total, customers] = await Promise.all([
    db.customer.count({ where }),
    db.customer.findMany({
      where,
      orderBy: [{ tradeName: "asc" }, { id: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        _count: { select: { persons: { where: { deletedAt: null } } } },
        // Las zonas de reparto del cliente: localidades de sus direcciones.
        addresses: {
          where: { deletedAt: null },
          select: { city: { select: { name: true } } },
        },
      },
    }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const link = (target: number) => {
    const query = new URLSearchParams();
    if (q) query.set("q", q);
    if (target > 1) query.set("page", String(target));
    const text = query.toString();
    return text ? `${PATH}?${text}` : PATH;
  };

  return (
    <>
      <form action={PATH} className="mt-6 flex gap-3 text-sm">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder={t.customers.searchPlaceholder}
          aria-label={t.customers.search}
          className="w-full max-w-sm rounded border border-current/20 bg-transparent px-3 py-2"
        />
        <button type="submit" className={buttonClass()}>
          {t.customers.search}
        </button>
        {q && (
          <Link href={PATH} className={buttonClass("secondary")}>
            {t.customers.clear}
          </Link>
        )}
      </form>

      {customers.length === 0 ? (
        <p className="mt-6 text-sm opacity-70">{t.customers.empty}</p>
      ) : (
        <div className="overflow-x-auto print:overflow-visible">
          <table className="mt-6 w-full text-left text-sm">
            <thead className="border-b border-current/20">
              <tr>
                <th className="py-2 pr-3 font-medium">
                  {t.customers.tradeName}
                </th>
                <th className="py-2 pr-3 font-medium">{t.customers.cuit}</th>
                <th className="py-2 pr-3 font-medium">{t.customers.zones}</th>
                <th className="py-2 pr-3 text-right font-medium">
                  {t.customers.persons}
                </th>
              </tr>
            </thead>
            <tbody>
              {customers.map((customer) => (
                <tr
                  key={customer.id}
                  className="border-b border-current/10 align-top"
                >
                  <td className="py-2 pr-3">
                    <Link
                      href={`${PATH}/${customer.id}`}
                      className="font-medium hover:underline"
                    >
                      {customer.tradeName}
                    </Link>
                    <span className="block text-xs opacity-70">
                      {customer.legalName} ·{" "}
                      {t.taxConditions[customer.taxCondition]}
                    </span>
                  </td>
                  <td className="py-2 pr-3 font-mono whitespace-nowrap">
                    {formatCuit(customer.cuit)}
                  </td>
                  <td className="py-2 pr-3">
                    {[...new Set(customer.addresses.map((a) => a.city.name))]
                      .sort()
                      .join(", ") || "—"}
                  </td>
                  <td className="py-2 pr-3 text-right">
                    {customer._count.persons}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <nav className="mt-6 flex items-center justify-between gap-4 text-sm">
        <span className="opacity-70">
          {interpolate(t.customers.count, { count: format.number(total) })} ·{" "}
          {interpolate(t.customers.page, { page, pages })}
        </span>
        <div className="flex gap-3">
          {page > 1 && (
            <Link href={link(page - 1)} className={buttonClass("secondary")}>
              {t.customers.previous}
            </Link>
          )}
          {page < pages && (
            <Link href={link(page + 1)} className={buttonClass("secondary")}>
              {t.customers.next}
            </Link>
          )}
        </div>
      </nav>
    </>
  );
}
