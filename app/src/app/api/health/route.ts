import { db } from "@/lib/db";

// Used by the Docker HEALTHCHECK: it responds 200 only if the DB answers.
export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return Response.json({ status: "ok" });
  } catch {
    return Response.json({ status: "error" }, { status: 503 });
  }
}
