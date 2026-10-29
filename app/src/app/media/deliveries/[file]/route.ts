import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { readDeliveryFile } from "@/lib/delivery-files";
import { can } from "@/lib/permissions";

// Firmas y fotos de remitos: NO son públicas. Las ve quien gestiona pedidos;
// un repartidor, solo las de sus propias hojas de ruta.
export async function GET(
  _request: Request,
  { params }: RouteContext<"/media/deliveries/[file]">,
) {
  const user = await requireUser();
  const file = (await params).file;
  if (!can(user.role, "sales:read-all")) {
    if (!can(user.role, "routes:deliver")) {
      return new Response("Forbidden", { status: 403 });
    }
    const own = await db.routeStop.findFirst({
      where: {
        OR: [{ signatureFile: file }, { photoFile: file }],
        routeSheet: { driver: { userId: user.id } },
      },
      select: { id: true },
    });
    if (!own) return new Response("Forbidden", { status: 403 });
  }
  const data = await readDeliveryFile(file);
  if (!data) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
