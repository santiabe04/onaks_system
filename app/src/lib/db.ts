import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

// En desarrollo, el hot reload de Next recrea los módulos: guardamos la
// instancia en globalThis para no abrir un pool de conexiones nuevo cada vez.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// No validamos DATABASE_URL acá: `next build` importa este módulo sin DB.
// El pool recién se conecta en la primera query, y ahí falla si falta.
function createClient() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

export const db = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
