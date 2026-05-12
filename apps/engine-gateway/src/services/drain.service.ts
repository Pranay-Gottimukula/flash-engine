import { createSigner } from 'fast-jwt';
import { v4 as uuidv4 } from 'uuid';
import redis, { getRedisKeys } from './redis.service';
import prisma from '../lib/prisma';
import { getEventEntry } from './event-cache.service';

const TICKET_TTL_SEC = 900;  // 15 minutes — matches JWT expiry
const JWT_EXPIRY_SEC = 900;

// ── Drain registry ────────────────────────────────────────────────────────────
//
// One interval per active event. Single-server setup — no distributed locking
// needed. If this ever moves to multi-pod, replace setInterval with a
// distributed lock (Redlock) before starting each tick.

const activeDrains = new Map<string, NodeJS.Timeout>();

// ── Public API ────────────────────────────────────────────────────────────────

export function startDrain(publicKey: string, rateLimit: number): void {
  if (activeDrains.has(publicKey)) return;  // idempotent

  const intervalId = setInterval(() => {
    drainBatch(publicKey, rateLimit).catch(err =>
      console.error(`[drain] drainBatch error for ${publicKey}:`, err),
    );
  }, 1000);

  activeDrains.set(publicKey, intervalId);
  console.log(`[drain] Started for ${publicKey} — ${rateLimit} users/sec`);
}

export function stopDrain(publicKey: string): void {
  const id = activeDrains.get(publicKey);
  if (!id) return;
  clearInterval(id);
  activeDrains.delete(publicKey);
  console.log(`[drain] Stopped for ${publicKey}`);
}

export function getActiveDrains(): { count: number; events: string[] } {
  return { count: activeDrains.size, events: [...activeDrains.keys()] };
}

// ── Server startup ────────────────────────────────────────────────────────────
//
// TODO (server.ts): call initDrains() after Redis and Postgres are confirmed up.
//   import { initDrains } from './services/drain.service';
//   await initDrains();

export async function initDrains(): Promise<void> {
  // PAUSED events are excluded by the status filter — their queues are
  // preserved in Redis but not processed until resumeEvent() calls startDrain().
  const activeEvents = await prisma.saleEvent.findMany({
    where:  { status: 'ACTIVE' },
    select: { publicKey: true, rateLimit: true },
  });

  for (const event of activeEvents) {
    startDrain(event.publicKey, event.rateLimit);
  }

  console.log(`[drain] Initialised ${activeEvents.length} drain(s) from active events`);
}

// ── Core drain tick ───────────────────────────────────────────────────────────

async function drainBatch(publicKey: string, batchSize: number): Promise<void> {
  const { eventKey, queueKey, resultKey } = getRedisKeys(publicKey);

  const queueSize = await redis.zcard(queueKey);
  if (queueSize === 0) return;

  // Pop up to batchSize users in arrival order — atomic, no other drain can
  // claim the same users (single-server, single interval per event).
  const popped = await redis.zpopmin(queueKey, batchSize);

  // ioredis returns a flat array: [member, score, member, score, ...]
  // Preserve scores so we can re-add users to the queue if stock is restored.
  const users:  string[] = [];
  const scores: string[] = [];
  for (let i = 0; i < popped.length; i += 2) {
    users.push(popped[i]);
    scores.push(popped[i + 1]);
  }

  let soldOutIndex = -1;

  for (let i = 0; i < users.length; i++) {
    const userId = users[i];
    // Lua atomically checks stock, decrements if available, and writes the result.
    const code = await redis.drainProcess(eventKey, resultKey, userId);

    if (code === 1) {
      // Stock claimed — generate JWT and park it for the polling endpoint.
      await processWinner(publicKey, eventKey, resultKey, userId);
    } else {
      // Stock exhausted — this user was already marked SOLD_OUT by drainProcess.
      soldOutIndex = i;
      break;
    }
  }

  if (soldOutIndex !== -1) {
    // Build interleaved userId/score pairs for users we popped but didn't
    // process yet — the Lua script will also drain whatever remains in the
    // queue, re-checking stock before each write so a concurrent release
    // can rescue users instead of incorrectly marking them SOLD_OUT.
    const argv: string[] = [];
    for (let i = soldOutIndex + 1; i < users.length; i++) {
      argv.push(users[i], scores[i]);
    }
    await redis.bulkSoldOut(eventKey, resultKey, queueKey, ...argv);
  }
}

// ── Winner path ───────────────────────────────────────────────────────────────
//
// drain-process.lua already wrote userId="WON" to the result hash.
// Here we sign the JWT and park the token so the polling endpoint can return it.

async function processWinner(
  publicKey: string,
  eventKey:  string,
  resultKey: string,
  userId:    string,
): Promise<void> {
  const eventData = await getEventEntry(publicKey);

  if (!eventData) {
    // Event ended between Lua claiming stock and this point. Release the unit
    // and downgrade to SOLD_OUT so the polling endpoint doesn't hand out a token.
    await Promise.all([
      redis.hincrby(eventKey, 'stock', 1).catch(() => {}),
      redis.hset(resultKey, userId, 'SOLD_OUT').catch(() => {}),
    ]);
    return;
  }

  const jti = uuidv4();

  const sign = createSigner({
    key:       async () => eventData.rsaPrivateKey,
    algorithm: 'RS256',
    expiresIn: JWT_EXPIRY_SEC * 1000,
  });

  let token: string;
  try {
    token = await sign({ jti, sub: userId, pk: publicKey, eid: eventData.eventId });
  } catch (err) {
    console.error(`[drain] JWT sign failed for userId=${userId}:`, err);
    // Release the claimed stock unit and downgrade result.
    await Promise.all([
      redis.hincrby(eventKey, 'stock', 1).catch(() => {}),
      redis.hset(resultKey, userId, 'SOLD_OUT').catch(() => {}),
    ]);
    return;
  }

  // Park signed JWT — polling endpoint reads this key.
  // TTL matches the token's own expiry so the key self-cleans.
  await redis.set(`flash:ticket:${publicKey}:${userId}`, token, 'EX', TICKET_TTL_SEC);

  // DO NOT AWAIT — Postgres write must never block the drain loop.
  prisma.queueAttempt.create({
    data: { saleEventId: eventData.eventId, userId, result: 'WON', jti },
  }).catch(err => console.error('[drain/audit] QueueAttempt WON failed:', err));
}


// ── Integration TODOs ─────────────────────────────────────────────────────────
//
// TODO (admin.controller.ts — activateEvent):
//   import { startDrain } from '../services/drain.service';
//   // After Redis status is set to ACTIVE and event cache is warmed:
//   startDrain(event.publicKey, event.rateLimit);
//
// TODO (admin.controller.ts — endEvent):
//   import { stopDrain } from '../services/drain.service';
//   // After pipeline.exec() and before evictEventCache():
//   stopDrain(event.publicKey);
//
// TODO (server.ts — bootstrap):
//   import { initDrains } from './services/drain.service';
//   // After Postgres and Redis are confirmed up:
//   await initDrains();
