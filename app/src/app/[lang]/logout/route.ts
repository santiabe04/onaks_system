import { NextResponse, type NextRequest } from "next/server";
import { LOGIN_PATH } from "@/lib/routes";
import { deleteSession } from "@/lib/session";

// Sesión vencida o user dado de baja: ver LOGOUT_PATH en lib/routes.
// El logout voluntario sigue siendo la Server Action (POST) del menú.
export async function GET(request: NextRequest) {
  await deleteSession();
  return NextResponse.redirect(new URL(LOGIN_PATH, request.url));
}
