import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is missing!");
}

type PrismaClientSingleton = ReturnType<typeof createPrismaClient>;

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClientSingleton;
  pool?: Pool;
};

function createPrismaClient() {
  globalForPrisma.pool = new Pool({
    connectionString,
    max:                     3,   // Neon free = 10 total; leave headroom
    idleTimeoutMillis:       5_000,
    connectionTimeoutMillis: 10_000,
    keepAlive:               false,
    ssl:                     { rejectUnauthorized: false },
  });

  const adapter = new PrismaPg(globalForPrisma.pool);

  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export function getPoolStats() {
  return {
    total:   globalForPrisma.pool?.totalCount   ?? 0,
    idle:    globalForPrisma.pool?.idleCount     ?? 0,
    waiting: globalForPrisma.pool?.waitingCount  ?? 0,
  };
}

export default prisma;
