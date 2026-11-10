import { NextResponse, type NextRequest } from "next/server";
import { appLocale, localizePath } from "@/i18n/config";
import { proxyRedirect } from "@/lib/routes";
import { SESSION_COOKIE, verifySession } from "@/lib/session-token";

// Optimistic filter: avoids showing screens that would bounce anyway. It does not query
// the DB, so a recent role change or deactivation is only noticed in `lib/auth`.
export async function proxy(request: NextRequest) {
  const session = await verifySession(
    request.cookies.get(SESSION_COOKIE)?.value,
  );
  const { pathname, search } = request.nextUrl;

  const target = proxyRedirect(pathname, search, session);
  if (!target) {
    // Public URLs carry no language: they are rewritten to `app/[lang]` according to
    // the installation. A URL that already has the prefix (/es/login) ends in a 404.
    const url = request.nextUrl.clone();
    url.pathname = localizePath(pathname, appLocale());
    return NextResponse.rewrite(url);
  }

  const response = NextResponse.redirect(new URL(target, request.url));
  // Invalid or expired cookie: it is deleted so as not to verify it on every request.
  if (!session && request.cookies.has(SESSION_COOKIE)) {
    response.cookies.delete(SESSION_COOKIE);
  }
  return response;
}

export const config = {
  matcher: [
    // Everything except Next assets, files with an extension and the health check, which
    // Docker and CI use without a session.
    "/((?!_next/static|_next/image|api/health|favicon\\.ico|.*\\.[\\w]+$).*)",
  ],
};
