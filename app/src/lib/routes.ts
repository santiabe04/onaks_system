import type { UserType } from "@/generated/prisma/enums";

export const LOGIN_PATH = "/login";
/**
 * Clears the cookie and sends to login. Used by `lib/auth` when the token is valid
 * but the user no longer is (deactivated): if it redirected straight to /login, the
 * proxy would see a valid token and send it back to the home, in a loop.
 */
export const LOGOUT_PATH = "/logout";
export const CHANGE_PASSWORD_PATH = "/change-password";
const ADMIN_PATH = "/admin";
/** Driver's home: their route sheets. */
export const DELIVERY_PATH = "/delivery";

/** Where each role goes on entry or when it tries to open something that is not theirs. */
export function homePathFor(role: UserType): string {
  if (role === "ADMIN") return ADMIN_PATH;
  if (role === "DRIVER") return DELIVERY_PATH;
  return "/";
}

function isUnder(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`);
}

/**
 * Validates the login's `?next=`. Internal routes only: accepting any URL
 * would be an open redirect (`/login?next=https://phishing.com`).
 */
export function safeNextPath(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.startsWith("/")) return null;
  // `//host` and `/\host` browsers take as another domain.
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
 * Proxy decision: where to redirect, or null to let it through.
 * It is optimistic (it only looks at the token): the real authorization is in `lib/auth`.
 */
export function proxyRedirect(
  pathname: string,
  search: string,
  session: { role: UserType; mustChangePassword: boolean } | null,
): string | null {
  if (isUnder(pathname, LOGOUT_PATH)) return null;

  if (isUnder(pathname, LOGIN_PATH)) {
    if (!session) return null;
    return session.mustChangePassword
      ? CHANGE_PASSWORD_PATH
      : homePathFor(session.role);
  }

  if (!session) {
    const next = safeNextPath(`${pathname}${search}`);
    return next && next !== "/"
      ? `${LOGIN_PATH}?next=${encodeURIComponent(next)}`
      : LOGIN_PATH;
  }

  // With a pending password, it can only be changed (or log out).
  // Without the flag, /change-password stays open for a voluntary change.
  if (isUnder(pathname, CHANGE_PASSWORD_PATH)) return null;
  if (session.mustChangePassword) return CHANGE_PASSWORD_PATH;

  if (isUnder(pathname, ADMIN_PATH) && session.role !== "ADMIN") {
    return homePathFor(session.role);
  }

  return null;
}
