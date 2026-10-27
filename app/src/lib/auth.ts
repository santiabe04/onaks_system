import "server-only";
import { redirect } from "next/navigation";
import type { UserType } from "@/generated/prisma/enums";
import { db } from "./db";
import { can, type Permission } from "./permissions";
import { CHANGE_PASSWORD_PATH, homePathFor, LOGOUT_PATH } from "./routes";
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
  // Sin user puede haber igual un token válido: /logout lo borra antes del login.
  if (!user) redirect(LOGOUT_PATH);
  // La DB manda: el token puede no tener la marca (p. ej. si el admin la puso
  // después del login). Con contraseña pendiente no se usa nada más de la app.
  if (user.mustChangePassword) redirect(CHANGE_PASSWORD_PATH);
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

/**
 * Solo para cambiar la contraseña: exige sesión pero no que el cambio ya esté
 * hecho (si no, nadie con la marca podría cumplirlo).
 */
export async function requireUserForPasswordChange(): Promise<SessionUser> {
  const user = await findSessionUser();
  if (!user) redirect(LOGOUT_PATH);
  return user;
}

function checkPermission(
  user: SessionUser | null,
  permission: Permission,
): SessionUser {
  const checked = checkAccess(user);
  if (!can(checked.role, permission)) redirect(homePathFor(checked.role));
  return checked;
}

/** Como `getCurrentUser`, pero exige un permiso. Para páginas. */
export async function getUserWithPermission(
  permission: Permission,
): Promise<SessionUser> {
  "use cache: private";
  return checkPermission(await findSessionUser(), permission);
}

/**
 * Primera línea de toda Server Action que toca datos protegidos. Una action se
 * puede invocar con un POST directo: el proxy y la UI no alcanzan.
 */
export async function requirePermission(
  permission: Permission,
): Promise<SessionUser> {
  return checkPermission(await findSessionUser(), permission);
}
