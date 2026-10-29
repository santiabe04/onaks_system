import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { buttonClass } from "@/components/ui/button";
import { formatters } from "@/i18n/format";
import { getLocale, getT } from "@/i18n/server";
import { getUserWithPermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { getLockedMails } from "@/lib/login-attempts";
import { userControlProps } from "./control-props";
import { UserControls } from "./user-controls";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.users.title };
}

export default async function AdminUsersPage() {
  const t = await getT();

  return (
    <main className="mx-auto w-full max-w-4xl p-4 sm:p-8">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{t.users.title}</h1>
        <Link href="/admin/users/new" className={buttonClass()}>
          {t.users.newButton}
        </Link>
      </div>
      <p className="mt-2 text-sm opacity-70">{t.users.intro}</p>

      {/* La lista sale de la DB en cada request: va en Suspense (cacheComponents). */}
      <Suspense
        fallback={<p className="mt-6 text-sm opacity-70">{t.common.loading}</p>}
      >
        <AdminsTable />
      </Suspense>
    </main>
  );
}

async function AdminsTable() {
  const admin = await getUserWithPermission("users:manage");
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const format = formatters(locale);

  // Usuarios internos (admins y repartidores): personas sin cliente.
  const persons = await db.person.findMany({
    where: { customerId: null, deletedAt: null },
    orderBy: [{ surname: "asc" }, { name: "asc" }],
    include: {
      user: {
        where: { deletedAt: null },
        select: {
          id: true,
          isActive: true,
          passwordMustChange: true,
          userType: true,
        },
      },
    },
  });
  const lockedMails = await getLockedMails(persons.map((p) => p.mail));

  if (persons.length === 0) {
    return <p className="mt-6 text-sm opacity-70">{t.users.empty}</p>;
  }

  return (
    <div className="overflow-x-auto print:overflow-visible">
      <table className="mt-6 w-full text-left text-sm">
        <thead className="border-b border-current/20">
          <tr>
            <th className="py-2 pr-3 font-medium">{t.users.name}</th>
            <th className="py-2 pr-3 font-medium">{t.users.mail}</th>
            <th className="py-2 pr-3 font-medium">{t.users.role}</th>
            <th className="py-2 pr-3 font-medium">{t.users.status}</th>
          </tr>
        </thead>
        <tbody>
          {persons.map((person) => (
            <tr
              key={person.id}
              className="border-b border-current/10 align-top"
            >
              <td className="py-2 pr-3">
                {person.name} {person.surname}
              </td>
              <td className="py-2 pr-3">{person.mail}</td>
              <td className="py-2 pr-3">
                {person.user ? t.users.roles[person.user.userType] : "—"}
              </td>
              <td className="py-2 pr-3">
                <UserControls
                  {...userControlProps(person, {
                    lockedMails,
                    currentUserId: admin.id,
                    formatTime: format.time,
                    t: t.users,
                  })}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
