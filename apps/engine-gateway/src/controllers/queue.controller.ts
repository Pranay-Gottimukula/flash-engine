// apps/engine-gateway/src/controllers/queue.controller.ts
//
// ──────────────────────────────────────────────────────────────────────────────
// ARCHITECTURAL OVERVIEW — Queue Controller (HOT PATH)
// ──────────────────────────────────────────────────────────────────────────────
//
// This is the most performance-critical file in the entire system.
// During a flash sale, this endpoint may receive thousands of requests per
// second simultaneously.  Every line here has a latency implication.
//
// TARGET P99 LATENCY: < 30 ms
//   Budget breakdown:
//     ~1  ms  — Express middleware (body parse, logging)
//     ~1  ms  — publicKey lookup in Redis hash (single HMGET)
//     ~2  ms  — Lua script execution (atomic, server-side)
//     ~2  ms  — JWT sign (jsonwebtoken is slow; consider fast-jwt)
//     ~1  ms  — JSON serialization
//     ──────
//     ~7  ms  total (leaves plenty of margin for network jitter)
//
// DO NOT QUERY POSTGRES IN THIS HANDLER (during a live event).
//   The only acceptable Postgres write here is the async audit-log insert
//   (QueueAttempt), which MUST be fire-and-forget (do not await it).
//   All read operations use Redis.
//
// FIRE-AND-FORGET PATTERN for audit logging:
//   prisma.queueAttempt.create({ data: { ... } }).catch(err => {
//     // log but never let this crash the request
//     console.error('Audit log write failed:', err);
//   });
// ──────────────────────────────────────────────────────────────────────────────

import { Request, Response }              from 'express';
import { createSigner, createVerifier }   from 'fast-jwt';
import { v4 as uuidv4 }                   from 'uuid';
import redis, { getRedisKeys }            from '../services/redis.service';
import prisma                             from '../lib/prisma';
import { getEventEntry }                  from '../services/event-cache.service';

const JWT_EXPIRY_SEC = 15 * 60; // 15 minutes — window for end-user to complete purchase
//
// WHY 15 MINUTES?
//   Short enough to limit abuse (replay window is bounded).
//   Long enough for a checkout flow with payment processing.
//   If stock is exhausted before 15 min, the verify endpoint rejects anyway.

// ── POST /api/queue/join ──────────────────────────────────────────────────────
//
// Request body: { publicKey: string, userId: string, payload?: Record<string, unknown> }
//
// The `userId` should be whatever opaque identifier the B2B client uses on their
// end (email, UUID, etc.).  We don't authenticate it — that's the client's job.
// We only use it for analytics (QueueAttempt.userId).

export async function joinQueue(req: Request, res: Response): Promise<void> {
  // ── Step 1: Parse & validate ─────────────────────────────────────────────
  const { publicKey, userId } = req.body as {
    publicKey?: string;
    userId?:    string;
  };

  if (!publicKey || !userId) {
    res.status(400).json({ error: '`publicKey` and `userId` are required' });
    return;
  }

  if (!publicKey.startsWith('pk_live_')) {
    res.status(400).json({ error: 'Invalid public key format' });
    return;
  }

  // ── Step 2: Atomic queue admission (rate limit + stock + queue) ──────────
  const { eventKey, queueKey, resultKey } = getRedisKeys(publicKey);

  let code: number;
  let position: number | undefined;

  try {
    [code, , position] = await redis.queueAdmission(
      eventKey, queueKey, resultKey, Date.now(), userId,
    );
  } catch (err) {
    console.error('[queue/join] Redis error:', err);
    res.status(503).json({ error: 'Queue service temporarily unavailable' });
    return;
  }

  // ── Step 3: Map Lua return codes → HTTP responses ────────────────────────

  if (code === -4) {
    res.status(404).json({ error: 'EVENT_NOT_FOUND' });
    return;
  }

  if (code === -3) {
    res.status(400).json({ error: 'EVENT_NOT_ACTIVE' });
    return;
  }

  if (code === -5) {
    // User is already in the system — check their current status rather than
    // returning a generic ALREADY_JOINED so they get an actionable response.
    const current = await resolveUserStatus(publicKey, userId);
    if (current.status === 'QUEUED') {
      const pollUrl = `/api/queue/status?pk=${publicKey}&userId=${userId}`;
      res.status(200).json({ status: 'ALREADY_JOINED', position: current.position, pollUrl });
    } else if (current.status === 'WON') {
      'tokenExpired' in current
        ? res.status(200).json({ status: 'WON', tokenExpired: true })
        : res.status(200).json({ status: 'WON', token: current.token });
    } else if (current.status === 'SOLD_OUT') {
      res.status(200).json({ status: 'SOLD_OUT' });
    } else {
      // NOT_FOUND — defensive fallback (Lua said ALREADY_JOINED but state is gone)
      const pollUrl = `/api/queue/status?pk=${publicKey}&userId=${userId}`;
      res.status(200).json({ status: 'ALREADY_JOINED', pollUrl });
    }
    return;
  }

  if (code === -1) {
    prisma.queueAttempt.create({
      data: { saleEventId: '', userId, result: 'SOLD_OUT', jti: null },
    }).catch(() => {});
    res.status(200).json({ status: 'SOLD_OUT' });
    return;
  }

  if (code === 0) {
    prisma.queueAttempt.create({
      data: { saleEventId: '', userId, result: 'QUEUED', jti: null },
    }).catch(() => {});
    const pollUrl = `/api/queue/status?pk=${publicKey}&userId=${userId}`;
    res.status(202).json({
      status:         'QUEUED',
      position:       position ?? 0,
      pollUrl,
      pollIntervalMs: 2000,
    });
    return;
  }

  // ── code === 1: INSTANT WIN ───────────────────────────────────────────────
  //
  // Only instant winners need the event cache — queued users never reach here.
  // Cache miss falls back to Postgres once; subsequent requests hit in-process cache.

  const eventData = await getEventEntry(publicKey);

  if (!eventData) {
    // Extremely rare: event ended between Lua passing and this line.
    // Lua already decremented stock — release it back.
    await redis.hincrby(eventKey, 'stock', 1).catch(() => {});
    res.status(410).json({ error: 'Event no longer active' });
    return;
  }

  const jti = uuidv4();

  const sign = createSigner({
    key:       async () => eventData.rsaPrivateKey,
    algorithm: 'RS256',
    expiresIn: JWT_EXPIRY_SEC * 1000,
  });

  const token = await sign({
    jti,
    sub: userId,
    pk:  publicKey,
    eid: eventData.eventId,
  });

  // DO NOT AWAIT — Postgres latency must never block this response.
  prisma.queueAttempt.create({
    data: { saleEventId: eventData.eventId, userId, result: 'WON', jti },
  }).catch(err => console.error('[audit] QueueAttempt write failed:', err));

  res.status(200).json({ status: 'WON', token });
}

// ── GET /api/queue/status ─────────────────────────────────────────────────────
//
// Polling endpoint for queued users. Zero Postgres queries — pure Redis reads.
// Query params: pk (publicKey), userId

export async function getQueueStatus(req: Request, res: Response): Promise<void> {
  const { pk, userId } = req.query as { pk?: string; userId?: string };

  if (!pk || !userId) {
    res.status(400).json({ error: '`pk` and `userId` query params are required' });
    return;
  }

  const current = await resolveUserStatus(pk, userId);

  if (current.status === 'WON') {
    'tokenExpired' in current
      ? res.status(200).json({ status: 'WON', tokenExpired: true })
      : res.status(200).json({ status: 'WON', token: current.token });
    return;
  }

  if (current.status === 'SOLD_OUT') {
    res.status(200).json({ status: 'SOLD_OUT' });
    return;
  }

  if (current.status === 'QUEUED') {
    res.status(200).json({ status: 'QUEUED', position: current.position });
    return;
  }

  res.status(404).json({ error: 'NOT_FOUND' });
}

// ── Helper: resolve a user's current status from Redis ───────────────────────
//
// Used by both getQueueStatus and the ALREADY_JOINED path in joinQueue.
// All reads are from Redis — no Postgres, no event-cache.

type UserStatus =
  | { status: 'WON';      token: string }
  | { status: 'WON';      tokenExpired: true }
  | { status: 'SOLD_OUT' }
  | { status: 'QUEUED';   position: number }
  | { status: 'NOT_FOUND' };

async function resolveUserStatus(publicKey: string, userId: string): Promise<UserStatus> {
  const { queueKey, resultKey } = getRedisKeys(publicKey);

  const result = await redis.hget(resultKey, userId);

  if (result === 'WON') {
    const token = await redis.get(`flash:ticket:${publicKey}:${userId}`);
    return token ? { status: 'WON', token } : { status: 'WON', tokenExpired: true };
  }

  if (result === 'SOLD_OUT') {
    return { status: 'SOLD_OUT' };
  }

  // Not in result hash yet — check the waiting queue
  const rank = await redis.zrank(queueKey, userId);
  if (rank !== null) {
    return { status: 'QUEUED', position: rank + 1 }; // ZRANK is 0-based
  }

  return { status: 'NOT_FOUND' };
}

// ── POST /api/queue/verify ────────────────────────────────────────────────────
//
// TODO: Implement the server-side verify endpoint.
//
// This endpoint is called by the B2B CLIENT'S BACKEND (not the browser).
// It must be authenticated with the secretKey (X-Secret-Key header).
//
// Steps:
//   1. Authenticate: hash(req.headers['x-secret-key']) === event.secretKeyHash
//   2. Verify JWT signature: jwt.verify(token, JWT_SECRET)
//   3. Extract jti from the decoded payload
//   4. INSERT INTO UsedJti (jti, saleEventId, expiresAt) — if unique violation → 409
//   5. Return 200 { verified: true } on success
//
// INTENT:
//   This is what prevents a user from copy-pasting their winning token and
//   submitting two checkouts simultaneously.  The DB unique constraint is the
//   guarantee — no application-level lock needed.

export async function verifyToken(req: Request, res: Response): Promise<void> {

  const publicKeyHeader = req.headers['x-public-key'] as string | undefined;
  const { token }        = req.body as { token?: string };

  if (!publicKeyHeader || !token) {
    res.status(400).json({
      error: '`token` in body and `x-public-key` header are required',
    });
    return;
  }

  // ── Step 2: Decode token header to extract publicKey before verification ─────
  //
  // We need publicKey to look up the correct secretKey from the cache.
  // fast-jwt's createDecoder() decodes WITHOUT verifying — we use it only
  // to peek at the payload and get `pk` (publicKey) and `eid` (eventId).
  // Actual signature verification happens in Step 3 with the real secret.

  let unverifiedPayload: {
    jti?: string;
    sub?: string;
    pk?:  string;
    eid?: string;
    exp?: number;
  };

  try {
    const payloadB64 = token.split('.')[1];
    if (!payloadB64) throw new Error('Malformed token');
    unverifiedPayload = JSON.parse(
      Buffer.from(payloadB64, 'base64url').toString('utf8')
    );
  } catch {
    res.status(400).json({ error: 'Malformed token' });
    return;
  }

  const { pk: publicKey, eid: eventId } = unverifiedPayload;

  if(!publicKey || !eventId){
    res.status(400).json({ error: 'Token missing required claims' });
    return;
  }

  // Cross-check: token's pk claim must match the header
  // Prevents a client from verifying another client's token
  if (publicKey !== publicKeyHeader) {
    res.status(401).json({ error: 'Token does not belong to this event' });
    return;
  }

  // ── Step 3: Get the real secretKey from cache ────────────────────────────────
  //
  // Cross-check: the secretKey header the client sent must match what we have
  // stored for this event. If they don't match, reject immediately.
  // This prevents a client from verifying tokens belonging to another client's event.

  const eventData = await getEventEntry(publicKey);

  if (!eventData) {
    res.status(404).json({ error: 'Event not found or not active' });
    return;
  }

  // ── Step 4: Verify signature with RS256 ─────────────────────────────────────

  let verified: { jti: string; sub: string; exp: number };

  try {
    const verify = createVerifier({
      key:        async () => eventData.rsaPublicKey,  // public key — not private
      algorithms: ['RS256'],
    });

    verified = await verify(token) as typeof verified;
  } catch (err: any) {
    if (err.code === 'FAST_JWT_EXPIRED') {
      res.status(401).json({ error: 'Token expired' });
      return;
    }
    res.status(401).json({ error: 'Invalid token' });
    return;
  }

  if (!verified.jti) {
    res.status(400).json({ error: 'Token missing jti claim' });
    return;
  }

  // ── Steps 5: UsedJti insert + respond — identical to before ─────────────
  //
  // jti is the PRIMARY KEY of UsedJti.
  // Two concurrent verify calls both try to INSERT the same jti.
  // No distributed lock needed — the database constraint is the lock.

  try {
    await prisma.usedJti.create({
      data: {
        jti:         verified.jti,
        saleEventId: eventId,
        usedAt:      new Date(),
        expiresAt:   new Date(verified.exp * 1000),
      },
    });
  } catch (err: any) {
    if (err.code === 'P2002') {
      res.status(409).json({ error: 'Token already used' });
      return;
    }
    console.error('[verify] UsedJti insert failed:', err);
    res.status(500).json({ error: 'Verification failed' });
    return;
  }


  // ── Step 6: Respond ──────────────────────────────────────────────────────────

  res.status(200).json({
    verified: true,
    userId:   verified.sub,
    eventId,
  });
}
