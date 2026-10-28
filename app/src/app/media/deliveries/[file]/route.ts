import { requireUser } from "@/lib/auth";
import { readDeliveryFile } from "@/lib/delivery-files";
import { can } from "@/lib/permissions";

// Firmas y fotos de remitos: NO son públicas. Solo las ve quien reparte o
// gestiona pedidos (el nombre del archivo es al azar, pero igual se pide sesión).
export async function GET(
  _request: Request,
  { params }: RouteContext<"/media/deliveries/[file]">,
) {
  const user = await requireUser();
  if (!can(user.role, "routes:deliver") && !can(user.role, "sales:read-all")) {
    return new Response("Forbidden", { status: 403 });
  }
  const data = await readDeliveryFile((await params).file);
  if (!data) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
