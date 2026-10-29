import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { buttonClass } from "@/components/ui/button";
import { AuditAction, AuditEntity } from "@/generated/prisma/enums";
import { interpolate } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionary";
import { formatters } from "@/i18n/format";
import { getLocale, getT } from "@/i18n/server";
import { changedFields } from "@/lib/audit-data";
import {
  AUDIT_PAGE_SIZE,
  auditQuery,
  auditWhere,
  parseAuditFilters,
  type AuditFilters,
} from "@/lib/audit-filters";
import { getUserWithPermission } from "@/lib/auth";
import { db } from "@/lib/db";

const PATH = "/admin/audit";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.audit.title };
}

export default async function AuditPage({
  searchParams,
}: PageProps<"/[lang]/admin/audit">) {
  const t = await getT();

  return (
    <main className="mx-auto w-full max-w-5xl p-4 sm:p-8">
      <h1 className="text-2xl font-semibold">{t.audit.title}</h1>
      {/* Los filtros vienen de la URL y la lista de la DB: van en Suspense. */}
      <Suspense
        fallback={<p className="mt-6 text-sm opacity-70">{t.common.loading}</p>}
      >
        <AuditContent searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

type Person = { name: string; surname: string; mail: string };

const personLabel = (person: Person) =>
  `${person.name} ${person.surname} (${person.mail})`;

async function AuditContent({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await getUserWithPermission("audit:read");
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const filters = parseAuditFilters(await searchParams);
  const where = auditWhere(filters);
  const format = formatters(locale);

  const personSelect = { select: { name: true, surname: true, mail: true } };
  const [total, logs, actors] = await Promise.all([
    db.auditLog.count({ where }),
    db.auditLog.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (filters.page - 1) * AUDIT_PAGE_SIZE,
      take: AUDIT_PAGE_SIZE,
      include: { actor: { select: { person: personSelect } } },
    }),
    // Para el filtro, solo usuarios que tienen algún registro.
    db.user.findMany({
      where: { auditLogs: { some: {} } },
      select: { id: true, person: personSelect },
      orderBy: [{ person: { surname: "asc" } }, { person: { name: "asc" } }],
    }),
  ]);
  const pages = Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE));

  return (
    <>
      <FiltersForm
        t={t.audit}
        filters={filters}
        actors={actors.map((a) => ({ id: a.id, label: personLabel(a.person) }))}
      />

      {logs.length === 0 ? (
        <p className="mt-6 text-sm opacity-70">{t.audit.empty}</p>
      ) : (
        <div className="overflow-x-auto print:overflow-visible">
          <table className="mt-6 w-full text-left text-sm">
            <thead className="border-b border-current/20">
              <tr>
                <th className="py-2 font-medium">{t.audit.columns.date}</th>
                <th className="py-2 font-medium">{t.audit.columns.actor}</th>
                <th className="py-2 font-medium">{t.audit.columns.action}</th>
                <th className="py-2 font-medium">{t.audit.columns.entity}</th>
                <th className="py-2 font-medium">{t.audit.columns.ip}</th>
                <th className="py-2 font-medium">{t.audit.columns.detail}</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr
                  key={log.id}
                  className="border-b border-current/10 align-top"
                >
                  <td className="py-2 pr-3 whitespace-nowrap">
                    {format.dateTime(log.createdAt)}
                  </td>
                  <td className="py-2 pr-3">
                    {log.actor ? (
                      personLabel(log.actor.person)
                    ) : (
                      <span className="opacity-60">{t.audit.anonymous}</span>
                    )}
                  </td>
                  <td className="py-2 pr-3">{t.audit.actions[log.action]}</td>
                  <td className="py-2 pr-3">
                    {log.entityType ? t.audit.entities[log.entityType] : "—"}
                    {log.entityId && (
                      <span className="block font-mono text-xs opacity-60">
                        {log.entityId}
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-3 font-mono text-xs">
                    {log.ip ?? "—"}
                  </td>
                  <td className="py-2">
                    <Detail t={t.audit} log={log} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <nav className="mt-6 flex items-center justify-between gap-4 text-sm">
        <span className="opacity-70">
          {interpolate(t.audit.total, { count: format.number(total) })} ·{" "}
          {interpolate(t.audit.page, { page: filters.page, pages })}
        </span>
        <div className="flex gap-3">
          {filters.page > 1 && (
            <Link
              href={`${PATH}${auditQuery(filters, filters.page - 1)}`}
              className={buttonClass("secondary")}
            >
              {t.audit.previous}
            </Link>
          )}
          {filters.page < pages && (
            <Link
              href={`${PATH}${auditQuery(filters, filters.page + 1)}`}
              className={buttonClass("secondary")}
            >
              {t.audit.next}
            </Link>
          )}
        </div>
      </nav>
    </>
  );
}

// Formulario GET: los filtros quedan en la URL, se pueden compartir y recargar.
function FiltersForm({
  t,
  filters,
  actors,
}: {
  t: Dictionary["audit"];
  filters: AuditFilters;
  actors: { id: string; label: string }[];
}) {
  const field = "flex flex-col gap-1 text-sm";
  const control = "rounded border border-current/20 bg-transparent px-3 py-2";

  return (
    <form
      action={PATH}
      className="mt-6 grid grid-cols-2 items-end gap-3 md:grid-cols-6"
    >
      <label className={`${field} col-span-2`}>
        <span className="font-medium">{t.filters.actor}</span>
        <select
          name="actor"
          defaultValue={filters.actor ?? ""}
          className={control}
        >
          <option value="">{t.filters.all}</option>
          {actors.map((actor) => (
            <option key={actor.id} value={actor.id}>
              {actor.label}
            </option>
          ))}
        </select>
      </label>
      <label className={field}>
        <span className="font-medium">{t.filters.entity}</span>
        <select
          name="entity"
          defaultValue={filters.entity ?? ""}
          className={control}
        >
          <option value="">{t.filters.all}</option>
          {Object.values(AuditEntity).map((entity) => (
            <option key={entity} value={entity}>
              {t.entities[entity]}
            </option>
          ))}
        </select>
      </label>
      <label className={field}>
        <span className="font-medium">{t.filters.action}</span>
        <select
          name="action"
          defaultValue={filters.action ?? ""}
          className={control}
        >
          <option value="">{t.filters.all}</option>
          {Object.values(AuditAction).map((action) => (
            <option key={action} value={action}>
              {t.actions[action]}
            </option>
          ))}
        </select>
      </label>
      <label className={field}>
        <span className="font-medium">{t.filters.from}</span>
        <input
          type="date"
          name="from"
          defaultValue={filters.from}
          className={control}
        />
      </label>
      <label className={field}>
        <span className="font-medium">{t.filters.to}</span>
        <input
          type="date"
          name="to"
          defaultValue={filters.to}
          className={control}
        />
      </label>
      <div className="col-span-2 flex gap-3 md:col-span-6">
        <button type="submit" className={buttonClass()}>
          {t.filters.apply}
        </button>
        <Link href={PATH} className={buttonClass("secondary")}>
          {t.filters.clear}
        </Link>
      </div>
    </form>
  );
}

type LogDetail = {
  action: AuditAction;
  before: unknown;
  after: unknown;
  metadata: unknown;
  userAgent: string | null;
};

function Detail({ t, log }: { t: Dictionary["audit"]; log: LogDetail }) {
  // En un UPDATE solo interesa lo que cambió; en un alta, cómo quedó; en una
  // baja, cómo era. En el resto (logins, etc.) los datos del evento.
  const rows =
    log.action === "UPDATE"
      ? changedFields(log.before, log.after)
      : Object.entries(
          ((log.action === "DELETE" ? log.before : log.after) ??
            log.metadata ??
            {}) as Record<string, unknown>,
        ).map(([field, value]) => ({ field, after: value }));

  if (rows.length === 0 && !log.userAgent) return <span>—</span>;

  return (
    <details>
      <summary className="cursor-pointer select-none">{t.show}</summary>
      <div className="overflow-x-auto print:overflow-visible">
        <table className="mt-2 text-xs">
          {log.action === "UPDATE" && (
            <thead>
              <tr className="opacity-70">
                <th className="pr-3 font-medium">{t.field}</th>
                <th className="pr-3 font-medium">{t.before}</th>
                <th className="font-medium">{t.after}</th>
              </tr>
            </thead>
          )}
          <tbody>
            {rows.map((row) => (
              <tr key={row.field}>
                <td className="pr-3 font-mono opacity-70">{row.field}</td>
                {"before" in row && (
                  <td className="pr-3 break-all">{show(row.before)}</td>
                )}
                <td className="break-all">{show(row.after)}</td>
              </tr>
            ))}
            {log.userAgent && (
              <tr>
                <td className="pr-3 font-mono opacity-70">{t.userAgent}</td>
                <td colSpan={2} className="break-all opacity-70">
                  {log.userAgent}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function show(value: unknown): string {
  if (value === null || value === undefined) return "—";
  return typeof value === "string" ? value : JSON.stringify(value);
}
