import Link from "next/link";
import { logout } from "@/app/[lang]/login/actions";
import { getT } from "@/i18n/server";
import { getCurrentUser } from "@/lib/auth";
import { CHANGE_PASSWORD_PATH } from "@/lib/routes";
import { APP_VERSION } from "@/lib/version";

/** Pie del menú del admin. Lee la sesión: va dentro de un <Suspense>. */
export async function SidebarUser() {
  const [user, t] = await Promise.all([getCurrentUser("ADMIN"), getT()]);

  return (
    <div className="flex flex-col gap-2 text-sm">
      <span className="truncate font-medium" title={user.name}>
        {user.name}
      </span>
      <div className="flex items-center gap-4">
        <Link
          href={CHANGE_PASSWORD_PATH}
          className="opacity-70 hover:underline"
        >
          {t.userMenu.changePassword}
        </Link>
        {/* Logout por POST: un link GET lo dispararía cualquier prefetch. */}
        <form action={logout}>
          <button type="submit" className="opacity-70 hover:underline">
            {t.userMenu.logout}
          </button>
        </form>
      </div>
      <span className="text-xs opacity-50" title={t.userMenu.version}>
        {APP_VERSION}
      </span>
    </div>
  );
}
