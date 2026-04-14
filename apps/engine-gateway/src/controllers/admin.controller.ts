// apps/engine-gateway/src/controllers/admin.controller.ts
//
// ──────────────────────────────────────────────────────────────────────────────
// ARCHITECTURAL OVERVIEW — Admin Controller
// ──────────────────────────────────────────────────────────────────────────────
//
// This controller handles platform-operator actions (your dashboard calling the
// API, not end-users calling the API).
//
// AUTHENTICATION TODO:
//   This endpoint MUST be protected before going to production.
//   Options (pick one):
//     A) Bearer token in Authorization header (a long-lived operator secret)
//        signed with a separate JWT_ADMIN_SECRET env var.
//     B) API Gateway (Kong, AWS API GW) that strips requests without a valid
//        internal service token before they reach Express.
//     C) mTLS between the dashboard server and engine-gateway.
//
//   For local dev, a simple middleware that checks
//     req.headers['x-admin-secret'] === process.env.ADMIN_SECRET
//   is sufficient.
// ──────────────────────────────────────────────────────────────────────────────

import { Request, Response } from 'express';
import crypto                 from 'crypto';
import prisma from '../lib/prisma';
import redis                  from '../services/redis.service';
import { warmEventCache, evictEventCache } from '../services/event-cache.service';

// TODO: Replace with a shared singleton from src/lib/prisma.ts
// const prisma = new PrismaClient();

// ── POST /api/admin/events ────────────────────────────────────────────────────
//
// Creates a new flash sale event. Returns the key-pair ONCE. The secret key
// is hashed before storage (like a GitHub PAT) — you cannot retrieve it again.

export async function createEvent(req: Request, res: Response): Promise<void> {
  // ── Step 1: Validate & parse request body ─────────────────────────────────
  //
  // TODO: Use zod (or class-validator) to validate and parse the body.
  // Suggested schema:
  //
  //   const CreateEventSchema = z.object({
  //     name:       z.string().min(3).max(120),
  //     stockCount: z.number().int().positive().max(10_000_000),
  //     rateLimit:  z.number().int().positive().max(10_000).default(50),
  //   });
  //
  //   const parsed = CreateEventSchema.safeParse(req.body);
  //   if (!parsed.success) {
  //     res.status(400).json({ error: parsed.error.flatten() });
  //     return;
  //   }
  //   const { name, stockCount, rateLimit } = parsed.data;

  const { clientId, name, stockCount, rateLimit = 50 } = req.body as {
    clientId?:   string;
    name?:       string;
    stockCount?: number;
    rateLimit?:  number;
  };


  if (!clientId || !name || !stockCount) {
    res.status(400).json({ error: '`clientId`, `name` and `stockCount` are required' });
    return;
  }

  if (!Number.isInteger(stockCount) || stockCount <= 0) {
    res.status(400).json({ error: '`stockCount` must be a positive integer' });
    return;
  }

  if (!Number.isInteger(rateLimit) || rateLimit <= 0 || rateLimit > 10_000) {
    res.status(400).json({ error: '`rateLimit` must be between 1 and 10,000' });
    return;
  }

  const client = await prisma.client.findUnique({
    where:  { id: clientId },
    select: { id: true },
  });

  if (!client) {
    res.status(404).json({ error: 'Client not found' });
    return;
  }

  // ── Step 2: Generate cryptographically secure key pair ────────────────────
  //
  // WHY crypto.randomBytes() and NOT Math.random()?
  //   Math.random() is a pseudo-random number generator seeded from the system
  //   clock.  An attacker who knows approximately when your server started can
  //   brute-force the seed and predict all future "random" values.
  //   crypto.randomBytes() reads from the OS CSPRNG (/dev/urandom on Linux),
  //   which is cryptographically unpredictable.
  //
  // KEY LENGTH REASONING:
  //   32 bytes = 256 bits of entropy.  At 10^9 guesses/second, that's
  //   ~3.7 × 10^67 years to brute force.  Effectively unguessable.
  //
  // PREFIX CONVENTION (Stripe-style):
  //   pk_live_  → public key  (safe to log, safe in browser JS)
  //   sk_live_  → secret key  (NEVER log, NEVER expose to browser)
  //   pk_test_  / sk_test_ for sandbox environments.

  const publicKey  = `pk_live_${crypto.randomBytes(32).toString('hex')}`;
  const secretKey  = `sk_live_${crypto.randomBytes(32).toString('hex')}`;

  // ── Step 3: Hash the secret key before DB storage ─────────────────────────
  //
  // PATTERN: Store a one-way hash — return the plaintext exactly once.
  //
  // This means even if your database is breached, the attacker cannot use the
  // secret keys.  On verification, hash the incoming key and compare to the
  // stored hash.
  //
  // TODO: Uncomment when ready:
  //
  // const secretKeyHash = crypto
  //   .createHash('sha256')
  //   .update(rawSecretKey)
  //   .digest('hex');
  //
  // For now we store the plaintext (acceptable for a development stub).
  // const secretKeyToStore = secretKey; // TODO: replace with secretKeyHash

  // ── Step 4: Persist to Postgres ───────────────────────────────────────────
  //
  // TODO: Replace the mock response below with a real Prisma insert:
  //
  // const event = await prisma.clientEvent.create({
  //   data: {
  //     name,
  //     publicKey:  rawPublicKey,
  //     secretKey:  secretKeyToStore,
  //     stockCount,
  //     rateLimit,
  //     status:     'PENDING',
  //   },
  // });
  //
  // TRANSACTION NOTE: If you want to seed Redis ATOMICALLY with the DB insert
  // (so you never have a DB row with no Redis state), wrap both in a Prisma
  // interactive transaction:
  //
  // const event = await prisma.$transaction(async (tx) => {
  //   const created = await tx.clientEvent.create({ data: { ... } });
  //   await seedRedis(created.publicKey, stockCount, rateLimit);
  //   return created;
  // });
  //
  // If the Redis seed fails, the Prisma transaction rolls back the DB insert.

  // ── Step 4: Persist to Postgres + seed Redis inside a transaction ───────────
  //
  // WHY a transaction?
  //   If Postgres succeeds but Redis fails → DB row exists with no Redis state.
  //   The Lua script returns EVENT_NOT_FOUND for a valid event.
  //   Wrapping both means Redis failure rolls back the DB insert entirely.
  //   Clean slate — retrying createEvent works correctly.
  //
  // NOTE: secretKey stored as plaintext in Postgres (not hashed) because the
  //   queue controller needs the raw value to sign JWTs. Protect it with
  //   database encryption at rest rather than application-level hashing.
  //   secretKey is NEVER stored in Redis — it lives only in Postgres and the
  //   Node process cache (event-cache.service.ts).

  let event: Awaited<ReturnType<typeof prisma.saleEvent.create>>;

  try {
    event = await prisma.$transaction(async(tx) => {
      const created = tx.saleEvent.create({
        data: {
          clientId,
          name,
          stockCount,
          rateLimit,
          status:    'PENDING',
          publicKey,
          secretKey,
        },
      });

      await seedRedis({
        publicKey,
        secretKey,
        eventId:    (await created).id,
        stockCount,
        rateLimit,
      });

      return created;
    });
  } catch(err) {
    console.error('[admin/createEvent] Transaction failed:', err);
    res.status(500).json({ error: 'Failed to create event' });
    return;
  }

  // ── Step 5: Seed Redis atomically ─────────────────────────────────────────
  //
  // Store event state as a Redis Hash so the Lua script can read all fields
  // in one round trip (HMGET flash:event:{publicKey} status stock rateLimit …).
  //
  // NX FLAG — idempotency guard:
  //   HSETNX or a conditional SET with NX ensures that if this function is
  //   called twice (e.g., a dashboard double-click, a retry), the second call
  //   does NOT overwrite the stock counter after users have already joined.
  //
  // TODO: Uncomment when Lua script and Redis are ready:
  //
  // await seedRedis(rawPublicKey, stockCount, rateLimit);

  // ── Step 6: Respond — return plaintext secret key EXACTLY ONCE ───────────
  //
  // The client MUST copy the secretKey now.  We will never return it again.
  // The response should also include a human-readable warning to that effect.

  // MOCK RESPONSE (replace with `event` from the Prisma insert above):
  res.status(201).json({
    message:   'Event created. Copy your secretKey now — it will not be shown again.',
    id:        event.id,
    name:      event.name,
    status:    event.status,
    publicKey,
    secretKey,
  });
}

// ── Helper: Seed Redis with event state ──────────────────────────────────────
//

async function seedRedis(params: {
  publicKey:  string;
  secretKey:  string;
  eventId:    string;
  stockCount: number;
  rateLimit:  number;
}): Promise<void> {
  const { publicKey, secretKey, eventId, stockCount, rateLimit } = params;
  const key = `flash:event:${publicKey}`;

  // Check if already seeded — prevents overwrite on duplicate calls
  const exists = await redis.hexists(key, 'stock');
  if (exists) {
    throw new Error(`Redis key ${key} already exists — possible duplicate event creation`);
  }

  // Pipeline batches all HSET calls into one TCP round-trip
  const pipeline = redis.pipeline();
  pipeline.hset(key, 'status',           'PENDING');
  pipeline.hset(key, 'stock',            String(stockCount));
  pipeline.hset(key, 'rateLimit',        String(rateLimit));
  pipeline.hset(key, 'bucketTokens',     String(rateLimit));  // start full
  pipeline.hset(key, 'bucketLastRefill', String(Date.now()));
  pipeline.hset(key, 'secretKey',        secretKey);          // for JWT signing
  pipeline.hset(key, 'eventId',          eventId);            // for audit log
  pipeline.expire(key, 48 * 60 * 60);                         // 48hr TTL safety net
  await pipeline.exec();
}

// ── PUT /api/admin/events/:id/activate ───────────────────────────────────────
//
// TODO: Implement this endpoint to transition an event from PENDING → ACTIVE.
//
// Steps:
//   1. Find the event in Postgres by id.
//   2. Validate current status is PENDING (reject if already ACTIVE/ENDED).
//   3. Update Postgres: prisma.clientEvent.update({ where: { id }, data: { status: 'ACTIVE' } })
//   4. Update Redis:    redis.hset(`flash:event:${publicKey}`, 'status', 'ACTIVE')
//   5. Return 200.
//
// ORDERING NOTE: Update Postgres FIRST, then Redis.  If Redis update fails,
// you can retry it (the DB is the source of truth).  If you update Redis first
// and the DB write fails, users can join a queue that doesn't officially exist.

export async function activateEvent(req: Request<{ id: string }>, res: Response): Promise<void> {
  const { id } = req.params;

  const event = await prisma.saleEvent.findUnique({ where: { id } });

  if(!event){
    res.send(400).json({ error: 'Event not found' });
    return;
  }

  if(event.status !== 'PENDING'){
    res.send(409).json({ error: `Cannot activate — current status: ${event.status}` });
    return;
  }

  // Update status to active in database first
  try {
    await prisma.saleEvent.update({
      where: { id },
      data:  { status: 'ACTIVE' },
    });
  } catch (err) {
    console.error('[activateEvent] Postgres update failed:', err);
    res.status(500).json({ error: 'Failed to activate event' });
    return;
  }

  // Change status in redis
  try {
    await redis.hset(`flash:event:${event.publicKey}`, 'status', 'ACTIVE');
  } catch (err) {
    console.error(
      `[activateEvent] CRITICAL: Postgres updated but Redis failed for ${id}. ` +
      `Manual fix: redis-cli HSET flash:event:${event.publicKey} status ACTIVE`
    , err);
    res.status(500).json({ error: 'Activated in DB but Redis sync failed. Contact support.' });
    return;
  }

  // ── 3. Warm the Node cache AFTER Redis is confirmed ACTIVE ────────────────
  //
  // Order matters: warm cache only after both DB and Redis are consistent.
  // If Redis failed above we already returned — so reaching here means
  // everything is in sync and it's safe to start serving traffic.

  warmEventCache(event.publicKey, {
    secretKey: event.secretKey,
    eventId: event.id,
    name: event.name,
  });

  res.status(200).json({
    message: 'Event is now ACTIVE. Queue is open.',
    id:      event.id,
    status:  'ACTIVE',
  });
}

export async function endEvent(req: Request<{ id: string }>, res: Response): Promise<void> {
  const { id } = req.params;

  const event = await prisma.saleEvent.findUnique({ where: { id } });

  if(!event){
    res.status(400).json({ error: 'Event Not Found' });
    return;
  }

  if (event.status === 'ENDED') {
    res.status(409).json({ error: 'Event already ended' });
    return;
  }

  await prisma.saleEvent.update({
    where: { id },
    data:  { status: 'ENDED' },
  });

  // ── 2. Redis — mark ENDED + set TTL ──────────────────────────────────────
  //
  // Setting status to ENDED means the Lua script immediately starts
  // returning EVENT_NOT_ACTIVE for any in-flight requests.
  // TTL cleans up the hash from Redis memory after 48 hours.

  const pipeline = redis.pipeline();
  pipeline.hset(`flash:event:${event.publicKey}`, 'status', 'ENDED');
  pipeline.expire(`flash:event:${event.publicKey}`, 48 * 60 * 60);
  await pipeline.exec();

  // ── 3. Evict Node cache ───────────────────────────────────────────────────
  //
  // Remove secretKey from memory now that the event is over.
  // Any requests that sneak through after this point get a cache miss,
  // hit Postgres, find status=ENDED, and get null back → 404.

  evictEventCache(event.publicKey);

  res.status(200).json({
    message: 'Event ended. Queue is closed.',
    id:      event.id,
    status:  'ENDED',
  });
}