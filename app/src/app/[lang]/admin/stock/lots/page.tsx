import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { LotsTable } from "@/components/stock/lots-table";
import { formatters } from "@/i18n/format";
import { getLocale, getT } from "@/i18n/server";
import { getUserWithPermission } from "@/lib/auth";
import { listLots } from "@/lib/lots-queries";
import { isoDay } from "@/lib/order-period";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.lots.title };
}

export default async function LotsPage({
  searchParams,
}: PageProps<"/[lang]/admin/stock/lots">) {
  const t = await getT();
  return (
    <main className="mx-auto w-full max-w-6xl p-4 sm:p-8">
      <Link href="/admin/stock" className="text-sm hover:underline">
        ← {t.stock.title}
      </Link>
      <h1 className="mt-4 text-2xl font-semibold">{t.lots.title}</h1>
      <p className="mt-1 text-sm opacity-70">{t.lots.hint}</p>
      {/* El día de hoy y los lotes son de request: van en Suspense. */}
      <Suspense
        fallback={<p className="mt-6 text-sm opacity-70">{t.common.loading}</p>}
      >
        <Lots searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Lots({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await getUserWithPermission("stock:manage");
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const format = formatters(locale);
  await connection();
  const status = (await searchParams).status;
  const filter = status === "expired" || status === "soon" ? status : undefined;
  const lots = await listLots(isoDay(new Date()), { status: filter });

  const tab = (value: "expired" | "soon" | undefined, label: string) => (
    <Link
      key={label}
      href={value ? `/admin/stock/lots?status=${value}` : "/admin/stock/lots"}
      className={`rounded border px-3 py-1 ${
        filter === value ? "border-current" : "border-current/20 opacity-70"
      }`}
    >
      {label}
    </Link>
  );

  return (
    <>
      <div className="mt-4 flex flex-wrap gap-2 text-sm">
        {tab(undefined, t.lots.filterAll)}
        {tab("soon", t.lots.filterSoon)}
        {tab("expired", t.lots.filterExpired)}
      </div>
      <LotsTable lots={lots} format={format} t={t.lots} showProduct />
    </>
  );
}
