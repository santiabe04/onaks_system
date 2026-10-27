import type { UserType } from "@/generated/prisma/enums";

export const LOGIN_PATH = "/login";
/**
 * Borra la cookie y manda al login. Lo usa `lib/auth` cuando el token es válido
 * pero el user ya no (baja, desactivado): si redirigiera directo a /login, el
 * proxy vería un token válido y lo devolvería al inicio, en loop.
 */
export const LOGOUT_PATH = "/logout";
const ADMIN_PATH = "/admin";

/** Adónde va cada rol al entrar o cuando intenta abrir algo que no le corresponde. */
export function homePathFor(role: UserType): string {
  // Hasta que exista el panel de admin, su inicio es el ABM de unidades.
  return role === "ADMIN" ? "/admin/measurement-units" : "/";
}

function isUnder(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`);
}

/**
 * Valida el `?next=` del login. Solo rutas internas: aceptar cualquier URL
 * sería un open redirect (`/login?next=https://phishing.com`).
 */
export function safeNextPath(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.startsWith("/")) return null;
  // `//host` y `/\host` los navegadores los toman como otro dominio.
  const base = "http://onaks.internal";
  let url: URL;
  try {
    url = new URL(raw, base);
  } catch {
    return null;
  }
  if (
    url.origin !== base ||
    isUnder(url.pathname, LOGIN_PATH) ||
    isUnder(url.pathname, LOGOUT_PATH)
  ) {
    return null;
  }
  return `${url.pathname}${url.search}`;
}

/**
 * Decisión del proxy: a dónde redirigir, o null para dejar pasar.
 * Es optimista (solo mira el token): la autorización real está en `lib/auth`.
 */
export function proxyRedirect(
  pathname: string,
  search: string,
  session: { role: UserType } | null,
): string | null {
  if (isUnder(pathname, LOGOUT_PATH)) return null;

  if (isUnder(pathname, LOGIN_PATH)) {
    return session ? homePathFor(session.role) : null;
  }

  if (!session) {
    const next = safeNextPath(`${pathname}${search}`);
    return next && next !== "/"
      ? `${LOGIN_PATH}?next=${encodeURIComponent(next)}`
      : LOGIN_PATH;
  }

  if (isUnder(pathname, ADMIN_PATH) && session.role !== "ADMIN") {
    return homePathFor(session.role);
  }

  return null;
}
