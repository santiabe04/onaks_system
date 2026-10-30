import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense, type ReactNode } from "react";
import type { AuditAction } from "@/generated/prisma/enums";
import { interpolate } from "@/i18n/config";
import { formatters } from "@/i18n/format";
import { getLocale, getT } from "@/i18n/server";
import { getUserWithPermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { parseOrderPeriod } from "@/lib/order-period";
import { groupOrdersByZone } from "@/lib/orders-by-zone";
import { getPeriodOrders } from "@/lib/orders-by-zone-queries";

const DAY_MS = 24 * 60 * 60 * 1000;

// Se llama después de `connection()`: la hora es la del request, no la del build.
function hoursAgo24(): Date {
  return new Date(Date.now() - DAY_MS);
}
const RECENT_ACTIVITY = 10;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.dashboard.title };
}

// Dashboard: crece con cada fase (stock bajo, etc.).
export default async function DashboardPage() {
  const t = await getT();
  const loading = <p className="mt-3 text-sm opacity-70">{t.common.loading}</p>;

  return (
    <main className="mx-auto w-full max-w-5xl p-4 sm:p-8">
      <h1 className="text-2xl font-semibold">{t.dashboard.title}</h1>

      <Section title={t.dashboard.shortcuts}>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Shortcut href="/admin/measurement-units/new">
            {t.dashboard.newMeasurementUnit}
          </Shortcut>
          <Shortcut href="/admin/measurement-units">
            {t.dashboard.measurementUnits}
          </Shortcut>
          <Shortcut href="/admin/orders">{t.dashboard.ordersByZone}</Shortcut>
          <Shortcut href="/admin/audit">{t.adminNav.audit}</Shortcut>
        </div>
      </Section>

      <Section
        title={t.dashboard.thisWeek}
        action={
          <Link href="/admin/orders" className="text-sm hover:underline">
            {t.dashboard.viewAll}
          </Link>
        }
      >
        <Suspense fallback={loading}>
          <ThisWeek />
        </Suspense>
      </Section>

      {/* Datos de la DB en cada request: cada bloque en su Suspense. */}
      <Section title={t.dashboard.summary}>
        <Suspense fallback={loading}>
          <Summary />
        </Suspense>
      </Section>

      <Section title={t.dashboard.security}>
        <Suspense fallback={loading}>
          <Security />
        </Suspense>
      </Section>

      <Section
        title={t.dashboard.recentActivity}
        action={
          <Link href="/admin/audit" className="text-sm hover:underline">
            {t.dashboard.viewAll}
          </Link>
        }
      >
        <Suspense fallback={loading}>
          <RecentActivity />
        </Suspense>
      </Section>
    </main>
  );
}

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="mt-8">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-lg font-medium">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Shortcut({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded border border-current/20 px-4 py-3 text-sm font-medium hover:bg-current/5"
    >
      {children}
    </Link>
  );
}

function Stat({
  label,
  value,
  href,
}: {
  label: string;
  value: string;
  href?: string;
}) {
  const body = (
    <>
      <span className="block text-xl font-semibold tabular-nums sm:text-2xl">
        {value}
      </span>
      <span className="text-sm opacity-70">{label}</span>
    </>
  );
  const className = "rounded border border-current/20 px-4 py-3";
  return href ? (
    <Link href={href} className={`${className} hover:bg-current/5`}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

async function Summary() {
  await getUserWithPermission("dashboard:read");
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const format = formatters(locale);

  const [units, products, customers, users] = await Promise.all([
    db.measurementUnit.count(),
    db.product.count({ where: { deletedAt: null, isActive: true } }),
    db.customer.count({ where: { deletedAt: null } }),
    db.user.count({ where: { deletedAt: null, isActive: true } }),
  ]);

  return (
    <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
      <Stat
        label={t.dashboard.measurementUnits}
        value={format.number(units)}
        href="/admin/measurement-units"
      />
      <Stat label={t.dashboard.products} value={format.number(products)} />
      <Stat label={t.dashboard.customers} value={format.number(customers)} />
      <Stat label={t.dashboard.users} value={format.number(users)} />
    </div>
  );
}

/** La semana de reparto en curso (sábado a viernes), igual que "Pedidos por zona". */
async function ThisWeek() {
  await getUserWithPermission("sales:read-all");
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const format = formatters(locale);

  // La semana actual depende de la hora del request, no de la del build.
  await connection();
  const period = parseOrderPeriod({});
  const [orders, held] = await Promise.all([
    getPeriodOrders(period),
    // De cualquier semana: esperan que el admin decida.
    db.sale.count({
      where: {
        creditHoldAt: { not: null },
        creditReleasedAt: null,
        state: { not: "CANCELED" },
      },
    }),
  ]);
  const { zones, totals } = groupOrdersByZone(orders, locale);
  const pending = orders.filter((order) => order.state === "PENDING").length;
  const day = (value: string) =>
    format.date(new Date(`${value}T12:00:00-03:00`));

  return (
    <>
      {held > 0 && (
        <Link
          href="/admin/orders/list?held=1"
          className="mt-3 block rounded border border-amber-600/50 bg-amber-500/10 p-3 text-sm font-medium hover:underline"
        >
          {interpolate(t.dashboard.heldOrders, { count: held })}
        </Link>
      )}
      <p className="mt-1 text-xs opacity-70">
        {interpolate(t.dashboard.thisWeekHint, {
          from: day(period.from),
          to: day(period.to),
        })}
      </p>
      {totals.count === 0 ? (
        <p className="mt-3 text-sm opacity-70">{t.dashboard.weekEmpty}</p>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat
              label={t.dashboard.weekOrders}
              value={format.number(totals.count)}
              href="/admin/orders"
            />
            <Stat
              label={t.dashboard.weekPending}
              value={format.number(pending)}
            />
            <Stat
              label={t.dashboard.weekAmount}
              value={format.money(totals.total)}
            />
            <Stat
              label={t.dashboard.weekWeight}
              value={interpolate(t.adminOrders.kg, {
                value: format.number(totals.weight),
              })}
            />
          </div>
          {/* Las zonas con más pedidos primero: dónde se va a concentrar el reparto. */}
          <ul className="mt-3 flex flex-wrap gap-2 text-sm">
            {[...zones]
              .sort((a, b) => b.totals.count - a.totals.count)
              .map((zone) => (
                <li
                  key={zone.cityId}
                  className="rounded border border-current/20 px-3 py-1"
                >
                  <span className="font-medium">{zone.cityName}</span>{" "}
                  <span className="opacity-70">
                    {interpolate(t.dashboard.weekZoneCount, {
                      count: format.number(zone.totals.count),
                    })}
                  </span>
                </li>
              ))}
          </ul>
        </>
      )}
    </>
  );
}

async function Security() {
  await getUserWithPermission("audit:read");
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const format = formatters(locale);

  await connection();
  const since = hoursAgo24();
  const count = (action: AuditAction) =>
    db.auditLog.count({ where: { action, createdAt: { gte: since } } });
  const [failed, locked, denied] = await Promise.all([
    count("LOGIN_FAILURE"),
    count("LOGIN_LOCKED"),
    count("ACCESS_DENIED"),
  ]);

  // Cada número lleva al visor filtrado por esa acción.
  const link = (action: AuditAction) => `/admin/audit?action=${action}`;
  return (
    <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3">
      <Stat
        label={t.dashboard.failedLogins}
        value={format.number(failed)}
        href={link("LOGIN_FAILURE")}
      />
      <Stat
        label={t.dashboard.lockedLogins}
        value={format.number(locked)}
        href={link("LOGIN_LOCKED")}
      />
      <Stat
        label={t.dashboard.accessDenied}
        value={format.number(denied)}
        href={link("ACCESS_DENIED")}
      />
    </div>
  );
}

async function RecentActivity() {
  await getUserWithPermission("audit:read");
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const format = formatters(locale);

  const logs = await db.auditLog.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: RECENT_ACTIVITY,
    include: {
      actor: { select: { person: { select: { name: true, surname: true } } } },
    },
  });

  if (logs.length === 0) {
    return <p className="mt-3 text-sm opacity-70">{t.dashboard.noActivity}</p>;
  }

  return (
    <ul className="mt-3 divide-y divide-current/10 text-sm">
      {logs.map((log) => (
        <li key={log.id} className="flex flex-wrap gap-x-4 gap-y-1 py-2">
          <span className="w-36 shrink-0 opacity-70">
            {format.dateTime(log.createdAt)}
          </span>
          <span className="min-w-40 flex-1">
            {log.actor
              ? `${log.actor.person.name} ${log.actor.person.surname}`
              : t.audit.anonymous}
          </span>
          <span className="w-40">{t.audit.actions[log.action]}</span>
          <span className="w-40 opacity-70">
            {log.entityType ? t.audit.entities[log.entityType] : "—"}
          </span>
        </li>
      ))}
    </ul>
  );
}
