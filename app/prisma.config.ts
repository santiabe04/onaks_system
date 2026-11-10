import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // No env() on purpose: `prisma generate` (postinstall) has to work
    // without DATABASE_URL. The migrate commands fail if it is missing.
    url: process.env.DATABASE_URL,
  },
});
