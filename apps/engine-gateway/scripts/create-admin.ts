#!/usr/bin/env tsx
import dotenv    from 'dotenv';
dotenv.config();

import { PrismaClient } from '@prisma/client';
import { Pool }         from 'pg';
import { PrismaPg }     from '@prisma/adapter-pg';
import bcrypt           from 'bcryptjs';
import crypto           from 'node:crypto';
import readline         from 'node:readline';

const pool    = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma  = new PrismaClient({ adapter });

// Single interface; async iterator correctly queues buffered piped lines.
const rl = readline.createInterface({
  input:    process.stdin,
  output:   process.stdout,
  terminal: process.stdin.isTTY ?? false,
});

const lines = rl[Symbol.asyncIterator]();

async function prompt(question: string): Promise<string> {
  process.stdout.write(question);
  const result = await lines.next();
  return result.done ? '' : (result.value as string).trim();
}

async function main() {
  console.log('FlashEngine — Create Super Admin\n');

  const email    = await prompt('Email: ');
  const password = await prompt('Password (min 8 chars): ');

  if (password.length < 8) {
    console.error('Password must be at least 8 characters');
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const admin = await prisma.appClient.upsert({
    where:  { email },
    update: { passwordHash, role: 'SUPER_ADMIN', suspended: false },
    create: {
      email,
      passwordHash,
      role:      'SUPER_ADMIN',
      name:      'Platform Admin',
      publicKey: crypto.randomUUID(),
    },
  });

  console.log('\n✓ Super admin created/updated successfully');
  console.log('  ID:   ', admin.id);
  console.log('  Email:', admin.email);
  console.log('  Role: ', admin.role);
  console.log('\nYou can now log in at /login with these credentials.');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(async () => { rl.close(); await prisma.$disconnect(); await pool.end(); });
