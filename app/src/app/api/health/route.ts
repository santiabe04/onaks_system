import { db } from "@/lib/db";

// Lo usa el HEALTHCHECK de Docker: responde 200 solo si la DB contesta.
export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return Response.json({ status: "ok" });
  } catch {
    return Response.json({ status: "error" }, { status: 503 });
  }
}
