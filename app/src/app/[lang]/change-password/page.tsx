import type { Metadata } from "next";
import { logout } from "@/app/[lang]/login/actions";
import { getT } from "@/i18n/server";
import { ChangePasswordForm } from "./change-password-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.changePassword.title };
}

// Sin UserMenu: getCurrentUser redirige acá mismo si el cambio está pendiente.
// El acceso lo controlan el proxy y la Server Action.
export default async function ChangePasswordPage() {
  const t = await getT();

  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold">{t.changePassword.title}</h1>
        <p className="mt-1 text-sm opacity-70">{t.changePassword.intro}</p>
        <ChangePasswordForm
          t={t.changePassword}
          pendingLabel={t.common.saving}
        />
        <form action={logout} className="mt-4 text-center">
          <button type="submit" className="text-sm opacity-70 hover:underline">
            {t.userMenu.logout}
          </button>
        </form>
      </div>
    </main>
  );
}
