import Link from "next/link";
import type { UserType } from "@/generated/prisma/enums";
import { CHANGE_PASSWORD_PATH } from "@/lib/routes";
import { logout } from "@/app/[lang]/login/actions";
import { getT } from "@/i18n/server";
import { getCurrentUser } from "@/lib/auth";

/**
 * User name and logout button. Reads the session: it goes inside a <Suspense>.
 * Without a session (or with another role than `role`) it redirects; the real protection of the
 * data is still in each page and Server Action.
 */
export async function UserMenu({ role }: { role?: UserType }) {
  const [user, t] = await Promise.all([getCurrentUser(role), getT()]);

  return (
    <div className="flex items-center gap-4 text-sm">
      <span className="opacity-70">{user.name}</span>
      <Link href={CHANGE_PASSWORD_PATH} className="hover:underline">
        {t.userMenu.changePassword}
      </Link>
      {/* Logout by POST: a GET link would be triggered by any prefetch. */}
      <form action={logout}>
        <button type="submit" className="hover:underline">
          {t.userMenu.logout}
        </button>
      </form>
    </div>
  );
}
