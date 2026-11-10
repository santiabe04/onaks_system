import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { proofContentType, readProofFile } from "@/lib/transfer-proof-files";

// Transfer receipts: NOT public. Seen by whoever manages
// orders and, for each receipt, the company the order belongs to.
export async function GET(
  _request: Request,
  { params }: RouteContext<"/media/transfers/[file]">,
) {
  const user = await requireUser();
  const file = (await params).file;

  if (!can(user.role, "sales:read-all")) {
    // Another customer gets the same as if the file did not exist.
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
      // A PDF is downloaded instead of opened in the app's tab.
      "Content-Disposition": isPdf
        ? `attachment; filename="${file}"`
        : "inline",
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
