import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

// In development, Next's hot reload recreates the modules: we keep the
// instance on globalThis so as not to open a new connection pool each time.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// We do not validate DATABASE_URL here: `next build` imports this module without a DB.
// The pool only connects on the first query, and that is where it fails if it is missing.
function createClient() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

export const db = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
