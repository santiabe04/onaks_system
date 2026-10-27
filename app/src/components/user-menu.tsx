import type { UserType } from "@/generated/prisma/enums";
import { logout } from "@/app/login/actions";
import { getCurrentUser } from "@/lib/auth";

/**
 * Nombre del usuario y botón de salir. Lee la sesión: va dentro de un <Suspense>.
 * Sin sesión (o con otro rol que `role`) redirige; la protección real de los
 * datos igual está en cada página y Server Action.
 */
export async function UserMenu({ role }: { role?: UserType }) {
  const user = await getCurrentUser(role);

  return (
    <div className="flex items-center gap-4 text-sm">
      <span className="opacity-70">{user.name}</span>
      {/* Logout por POST: un link GET lo dispararía cualquier prefetch. */}
      <form action={logout}>
        <button type="submit" className="hover:underline">
          Salir
        </button>
      </form>
    </div>
  );
}
