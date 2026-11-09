import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { proofContentType, readProofFile } from "@/lib/transfer-proof-files";

// Comprobantes de transferencia: NO son públicos. Los ve quien gestiona
// pedidos y, de cada comprobante, la empresa a la que pertenece el pedido.
export async function GET(
  _request: Request,
  { params }: RouteContext<"/media/transfers/[file]">,
) {
  const user = await requireUser();
  const file = (await params).file;

  if (!can(user.role, "sales:read-all")) {
    // Otro cliente recibe lo mismo que si el archivo no existiera.
    const own = user.customerId
      ? await db.transferProof.findFirst({
          where: { file, sale: { address: { customerId: user.customerId } } },
          select: { id: true },
        })
      : null;
    if (!own) return new Response("Not found", { status: 404 });
  }
  const data = await readProofFile(file);
  if (!data) return new Response("Not found", { status: 404 });

  const isPdf = file.endsWith(".pdf");
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": proofContentType(file),
      // Un PDF se descarga en vez de abrirse en la pestaña de la app.
      "Content-Disposition": isPdf
        ? `attachment; filename="${file}"`
        : "inline",
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
