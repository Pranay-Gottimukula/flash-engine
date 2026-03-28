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
    // For NeonDB: use the direct (non-pooled) connection string here
    // so that prisma migrate dev can run DDL statements directly.
    url: process.env["DATABASE_URL"] as string,
  },
});
