import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Sin env() a propósito: `prisma generate` (postinstall) tiene que andar
    // sin DATABASE_URL. Los comandos de migrate fallan si falta.
    url: process.env.DATABASE_URL,
  },
});
