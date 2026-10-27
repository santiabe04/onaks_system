import { NextResponse, type NextRequest } from "next/server";
import { proxyRedirect } from "@/lib/routes";
import { SESSION_COOKIE, verifySession } from "@/lib/session-token";

// Filtro optimista: evita mostrar pantallas que igual van a rebotar. No consulta
// la DB, así que un rol o una baja recientes recién se notan en `lib/auth`.
export async function proxy(request: NextRequest) {
  const session = await verifySession(
    request.cookies.get(SESSION_COOKIE)?.value,
  );
  const { pathname, search } = request.nextUrl;

  const target = proxyRedirect(pathname, search, session);
  if (!target) return NextResponse.next();

  const response = NextResponse.redirect(new URL(target, request.url));
  // Cookie inválida o vencida: se borra para no verificarla en cada request.
  if (!session && request.cookies.has(SESSION_COOKIE)) {
    response.cookies.delete(SESSION_COOKIE);
  }
  return response;
}

export const config = {
  matcher: [
    // Todo menos assets de Next, archivos con extensión y el health check, que
    // usan Docker y el CI sin sesión.
    "/((?!_next/static|_next/image|api/health|favicon\\.ico|.*\\.[\\w]+$).*)",
  ],
};
