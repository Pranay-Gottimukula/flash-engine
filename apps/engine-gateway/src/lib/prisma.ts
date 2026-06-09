// import { PrismaClient } from "@prisma/client";
// import { Pool } from "pg";
// import { PrismaPg } from "@prisma/adapter-pg";
// import dotenv from 'dotenv';
// import path from 'path';

// // Always load from apps/engine-gateway/.env, regardless of where the process was started.
// // override: true is critical — without it, dotenv silently skips vars already set in the shell
// // (e.g. DATABASE_URL exported from a previous Neon session), causing the wrong DB to be used.
// dotenv.config({ path: path.resolve(__dirname, '../../.env'), override: true });

// const connectionString = process.env.DATABASE_URL;
// if (!connectionString) {
//   throw new Error("DATABASE_URL environment variable is missing!");
// }

// // Only use SSL for remote/cloud databases (e.g. Neon). Local postgres doesn't need it.
// const isLocalDb = connectionString.includes('localhost') || connectionString.includes('127.0.0.1');
// const sslConfig = isLocalDb ? false : { rejectUnauthorized: false };

// type PrismaClientSingleton = ReturnType<typeof createPrismaClient>;

// const globalForPrisma = globalThis as unknown as {
//   prisma?: PrismaClientSingleton;
//   pool?: Pool;
// };

// function createPrismaClient() {
//   globalForPrisma.pool = new Pool({
//     connectionString,
//     max:                     isLocalDb ? 10 : 3,  // Local: generous; Neon free tier: leave headroom
//     idleTimeoutMillis:       5_000,
//     connectionTimeoutMillis: 10_000,
//     keepAlive:               false,
//     ssl:                     sslConfig,
//   });

//   const adapter = new PrismaPg(globalForPrisma.pool);

//   return new PrismaClient({
//     adapter,
//     log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
//   });
// }

// export const prisma = globalForPrisma.prisma ?? createPrismaClient();

// if (process.env.NODE_ENV !== "production") {
//   globalForPrisma.prisma = prisma;
// }

// export function getPoolStats() {
//   return {
//     total:   globalForPrisma.pool?.totalCount   ?? 0,
//     idle:    globalForPrisma.pool?.idleCount     ?? 0,
//     waiting: globalForPrisma.pool?.waitingCount  ?? 0,
//   };
// }

// export default prisma;

import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import dotenv from 'dotenv';

dotenv.config();

// 1. Grab your connection string
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is missing!");
}

// // 2. Setup the standard Postgres connection pool
// const pool = new Pool({ connectionString });

// // 3. Initialize the Prisma adapter with the pool
// const adapter = new PrismaPg(pool);

let _pool: Pool | undefined;

const prismaClientSingleton = () => {
  _pool = new Pool({ connectionString });
  const adapter = new PrismaPg(_pool);

  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });
};

type PrismaClientSingleton = ReturnType<typeof prismaClientSingleton>;

// Global singleton — prevents multiple connections during hot-reload in dev
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClientSingleton };

// 4. Inject the adapter into the PrismaClient constructor
export const prisma = globalForPrisma.prisma ?? prismaClientSingleton();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export function getPoolStats() {
  return {
    total:   _pool?.totalCount   ?? 0,
    idle:    _pool?.idleCount    ?? 0,
    waiting: _pool?.waitingCount ?? 0,
  };
}

export default prisma;