import Link from "next/link";
import type { UserType } from "@/generated/prisma/enums";
import { CHANGE_PASSWORD_PATH } from "@/lib/routes";
import { logout } from "@/app/[lang]/login/actions";
import { getT } from "@/i18n/server";
import { getCurrentUser } from "@/lib/auth";

/**
 * Nombre del usuario y botón de salir. Lee la sesión: va dentro de un <Suspense>.
 * Sin sesión (o con otro rol que `role`) redirige; la protección real de los
 * datos igual está en cada página y Server Action.
 */
export async function UserMenu({ role }: { role?: UserType }) {
  const [user, t] = await Promise.all([getCurrentUser(role), getT()]);

  return (
    <div className="flex items-center gap-4 text-sm">
      <span className="opacity-70">{user.name}</span>
      <Link href={CHANGE_PASSWORD_PATH} className="hover:underline">
        {t.userMenu.changePassword}
      </Link>
      {/* Logout por POST: un link GET lo dispararía cualquier prefetch. */}
      <form action={logout}>
        <button type="submit" className="hover:underline">
          {t.userMenu.logout}
        </button>
      </form>
    </div>
  );
}
