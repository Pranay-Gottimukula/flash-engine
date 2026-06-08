import dotenv from 'dotenv';
dotenv.config();

import { PrismaClient } from '@prisma/client';
import { Pool }         from 'pg';
import { PrismaPg }     from '@prisma/adapter-pg';
import bcrypt           from 'bcryptjs';
import crypto           from 'crypto';

const pool    = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma  = new PrismaClient({ adapter });

async function main() {
  const email       = process.env.SUPER_ADMIN_EMAIL    ?? 'admin@flashengine.dev';
  const rawPassword = process.env.SUPER_ADMIN_PASSWORD ?? 'admin123456';

  const passwordHash = await bcrypt.hash(rawPassword, 12);

  await prisma.appClient.upsert({
    where:  { email },
    update: {
      passwordHash,
      role:      'SUPER_ADMIN',
      suspended: false,
    },
    create: {
      email,
      passwordHash,
      role:      'SUPER_ADMIN',
      name:      'Platform Admin',
      publicKey: crypto.randomUUID(),
    },
  });

  console.log('✓ Super admin seeded:', email);
  console.log('  Email:', email);
  console.log('  Password:', rawPassword);
  console.log('  Role: SUPER_ADMIN');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); await pool.end(); });


// import dotenv from 'dotenv';
// dotenv.config();

// import { PrismaClient } from '@prisma/client';
// import bcrypt           from 'bcryptjs';
// import crypto           from 'crypto';

// const prisma = new PrismaClient();

// async function main() {
//   const email       = process.env.SUPER_ADMIN_EMAIL    ?? 'admin@flashengine.dev';
//   const rawPassword = process.env.SUPER_ADMIN_PASSWORD ?? 'admin123456';

//   const passwordHash = await bcrypt.hash(rawPassword, 12);

//   await prisma.appClient.upsert({
//     where:  { email },
//     update: { passwordHash, role: 'SUPER_ADMIN', suspended: false },
//     create: {
//       email,
//       passwordHash,
//       role:      'SUPER_ADMIN',
//       name:      'Platform Admin',
//       publicKey: crypto.randomUUID(),
//     },
//   });

//   console.log('✓ Super admin seeded:', email);
//   console.log('  Password:', rawPassword);
// }

// main()
//   .catch((e) => { console.error(e); process.exit(1); })
//   .finally(() => prisma.$disconnect());