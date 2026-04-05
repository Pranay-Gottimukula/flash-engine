// Prisma v7 config — connection URLs live here, NOT in schema.prisma
// See: https://pris.ly/d/config-datasource
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // DIRECT_URL bypasses the connection pooler so that prisma migrate dev
    // can run DDL (CREATE TABLE etc.) without "prepared statement" errors on NeonDB.
    // At runtime, lib/prisma.ts uses DATABASE_URL (pooler) via pg.Pool.
    url: (process.env["DIRECT_URL"] || process.env["DATABASE_URL"]) as string,
  },
});
