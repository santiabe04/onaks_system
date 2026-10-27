import "server-only";
import { redirect } from "next/navigation";
import type { UserType } from "@/generated/prisma/enums";
import { db } from "./db";
import { homePathFor, LOGIN_PATH } from "./routes";
import { getSession } from "./session";

export type SessionUser = {
  id: string;
  personId: string;
  customerId: string | null;
  role: UserType;
  name: string;
  mustChangePassword: boolean;
};

// El token solo prueba quién es. El rol y el estado salen de la DB, así una
// baja o un cambio de rol corta el acceso sin esperar a que venza la cookie.
async function findSessionUser(): Promise<SessionUser | null> {
  const session = await getSession();
  if (!session) return null;

  const user = await db.user.findFirst({
    where: {
      id: session.userId,
      isActive: true,
      deletedAt: null,
      person: { deletedAt: null },
    },
    select: {
      id: true,
      personId: true,
      userType: true,
      passwordMustChange: true,
      person: { select: { name: true, surname: true, customerId: true } },
    },
  });
  if (!user) return null;

  return {
    id: user.id,
    personId: user.personId,
    customerId: user.person.customerId,
    role: user.userType,
    name: `${user.person.name} ${user.person.surname}`,
    mustChangePassword: user.passwordMustChange,
  };
}

function checkAccess(user: SessionUser | null, role?: UserType): SessionUser {
  if (!user) redirect(LOGIN_PATH);
  if (role && user.role !== role) redirect(homePathFor(user.role));
  return user;
}

/**
 * Para renderizar (Server Components, dentro de un <Suspense>). Se cachea por
 * sesión: varios componentes de la misma página no repiten la consulta.
 */
export async function getCurrentUser(role?: UserType): Promise<SessionUser> {
  "use cache: private";
  return checkAccess(await findSessionUser(), role);
}

/** Para Server Actions y Route Handlers: siempre verifica contra la DB, sin caché. */
export async function requireUser(role?: UserType): Promise<SessionUser> {
  return checkAccess(await findSessionUser(), role);
}
