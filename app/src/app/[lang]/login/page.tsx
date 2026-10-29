import type { Metadata } from "next";
import { getT } from "@/i18n/server";
import { APP_NAME } from "@/lib/app";
import { LoginForm } from "./login-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.login.title };
}

export default async function LoginPage() {
  const t = await getT();

  return (
    <main className="flex flex-1 items-center justify-center p-4 sm:p-8">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold">{APP_NAME}</h1>
        <p className="mt-1 text-sm opacity-70">{t.login.intro}</p>
        <LoginForm t={t.login} />
      </div>
    </main>
  );
}
