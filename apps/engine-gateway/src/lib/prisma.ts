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

const prismaClientSingleton = () => {
  const pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  
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

export default prisma;