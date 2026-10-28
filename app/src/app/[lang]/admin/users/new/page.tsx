import type { Metadata } from "next";
import { getT } from "@/i18n/server";
import { AdminForm } from "../admin-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.users.newTitle };
}

export default async function NewAdminPage() {
  const t = await getT();

  return (
    <main className="mx-auto w-full max-w-xl p-8">
      <h1 className="text-2xl font-semibold">{t.users.newTitle}</h1>
      <AdminForm t={t.users} person={t.customers} common={t.common} />
    </main>
  );
}
