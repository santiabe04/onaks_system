import { NextResponse, type NextRequest } from "next/server";
import { LOGIN_PATH } from "@/lib/routes";
import { deleteSession } from "@/lib/session";

// Expired session or deactivated user: see LOGOUT_PATH in lib/routes.
// The voluntary logout is still the Server Action (POST) in the menu.
export async function GET(request: NextRequest) {
  await deleteSession();
  return NextResponse.redirect(new URL(LOGIN_PATH, request.url));
}
