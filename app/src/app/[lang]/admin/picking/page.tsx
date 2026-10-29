import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import type { PickingListState } from "@/generated/prisma/enums";
import { interpolate } from "@/i18n/config";
import { formatters } from "@/i18n/format";
import { getLocale, getT } from "@/i18n/server";
import { getUserWithPermission } from "@/lib/auth";
import { db } from "@/lib/db";

const PATH = "/admin/picking";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.picking.title };
}

export default async function PickingListsPage({
  searchParams,
}: PageProps<"/[lang]/admin/picking">) {
  const t = await getT();
  return (
    <main className="mx-auto w-full max-w-5xl p-4 sm:p-8">
      <h1 className="text-2xl font-semibold">{t.picking.title}</h1>
      {/* El filtro viene de la URL y las listas de la DB: van en Suspense. */}
      <Suspense
        fallback={<p className="mt-6 text-sm opacity-70">{t.common.loading}</p>}
      >
        <Lists searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

const STATE_COLOR: Record<PickingListState, string> = {
  OPEN: "text-amber-700 dark:text-amber-400",
  PREPARED: "",
  CANCELED: "text-red-600",
};

async function Lists({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await getUserWithPermission("sales:manage");
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const format = formatters(locale);
  const p = t.picking;
  const c = p.columns;
  const showAll = (await searchParams).all === "1";

  const lists = await db.pickingList.findMany({
    where: showAll ? {} : { state: "OPEN" },
    orderBy: { number: "desc" },
    take: 100,
    select: {
      number: true,
      state: true,
      createdAt: true,
      warehouse: { select: { name: true } },
      items: { select: { saleId: true } },
    },
  });

  return (
    <>
      <p className="mt-4 text-sm">
        <Link
          href={showAll ? PATH : `${PATH}?all=1`}
          className="hover:underline"
        >
          {showAll ? p.showOpen : p.showAll}
        </Link>
      </p>
      {lists.length === 0 ? (
        <p className="mt-6 text-sm opacity-70">{p.empty}</p>
      ) : (
        <div className="overflow-x-auto print:overflow-visible">
          <table className="mt-4 w-full text-left text-sm">
            <thead className="border-b border-current/20">
              <tr>
                <th className="py-2 pr-3 font-medium">{c.number}</th>
                <th className="py-2 pr-3 font-medium">{c.date}</th>
                <th className="py-2 pr-3 font-medium">{c.warehouse}</th>
                <th className="py-2 pr-3 font-medium">{c.orders}</th>
                <th className="py-2 font-medium">{c.state}</th>
              </tr>
            </thead>
            <tbody>
              {lists.map((list) => {
                const count = new Set(list.items.map((item) => item.saleId))
                  .size;
                return (
                  <tr key={list.number} className="border-b border-current/10">
                    <td className="py-2 pr-3">
                      <Link
                        href={`${PATH}/${list.number}`}
                        className="font-medium hover:underline"
                      >
                        #{list.number}
                      </Link>
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {format.dateTime(list.createdAt)}
                    </td>
                    <td className="py-2 pr-3">{list.warehouse.name}</td>
                    <td className="py-2 pr-3">
                      {count === 1
                        ? p.oneOrder
                        : interpolate(p.ordersCount, { count })}
                    </td>
                    <td className={`py-2 ${STATE_COLOR[list.state]}`}>
                      {p.states[list.state]}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
