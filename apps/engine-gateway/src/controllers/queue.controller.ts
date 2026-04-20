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
import redis                              from '../services/redis.service';
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
  // ══════════════════════════════════════════════════════════════════════════
  // STEP 1 — Parse & validate inputs
  // ══════════════════════════════════════════════════════════════════════════
  //
  // TODO: Replace this manual check with a zod schema for type-safety:
  //
  // const JoinSchema = z.object({
  //   publicKey: z.string().startsWith('pk_'),
  //   userId:    z.string().min(1).max(256),
  //   payload:   z.record(z.unknown()).optional(),
  // });
  // const body = JoinSchema.safeParse(req.body);
  // if (!body.success) { res.status(400).json(...); return; }
  
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

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 2 — Validate the public key (check event exists & is ACTIVE)
  // ══════════════════════════════════════════════════════════════════════════
  //
  // We ONLY read from Redis here — never Postgres.
  //
  // TODO: Replace the mock below with:
  //
  //   const redisKey   = `flash:event:${publicKey}`;
  //   const eventStatus = await redis.hget(redisKey, 'status');
  //
  //   if (!eventStatus) {
  //     // Key doesn't exist in Redis → unknown publicKey
  //     res.status(404).json({ error: 'Event not found' });
  //     return;
  //   }
  //   if (eventStatus !== 'ACTIVE') {
  //     // Event is PENDING or ENDED
  //     res.status(403).json({ error: `Event is ${eventStatus}` });
  //     return;
  //   }
  //
  // CACHING NOTE: If you want to pre-warm the Redis hash from Postgres on
  // cache-miss, do it here with a read-through pattern.  But for performance,
  // the event state should always be in Redis before the sale goes ACTIVE.

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 3 — Execute the Lua Leaky Bucket script (atomic rate limit + dequeue)
  // ══════════════════════════════════════════════════════════════════════════
  //
  // This is the core of the system.  The Lua script atomically:
  //   a) Checks event status (guard against race with Step 2)
  //   b) Checks + updates the token bucket (rate limiting)
  //   c) Decrements the stock counter
  //   d) Returns a result code: 1=WON, -1=SOLD_OUT, -2=RATE_LIMITED, -3=NOT_ACTIVE
  //
  // See redis.service.ts for the full Lua script pseudocode.
  //
  // TODO: Uncomment when Lua script is registered:
  //
  //   const [code, reason] = await redis.leakyBucket(
  //     1,                               // numkeys
  //     `flash:event:${publicKey}`,      // KEYS[1]
  //     Date.now(),                      // ARGV[1] — now in ms for bucket refill
  //   ) as [number, string];
  //
  //   if (code === -3) { res.status(403).json({ error: 'EVENT_NOT_ACTIVE' }); return; }
  //   if (code === -2) { res.status(429).json({ error: 'RATE_LIMITED',  retryAfterMs: 1000 }); return; }
  //   if (code === -1) { res.status(410).json({ error: 'SOLD_OUT' }); return; }
  //   // code === 1 → fall through to JWT generation

  let code: number;
  let reason: string;

  try{
    [code, reason] = await redis.leakyBucket(
      1,
      `flash:event:${publicKey}`,
      Date.now(),
    ) as [number, string];
  } catch(err) {
    console.error('[queue/join] Redis error:', err);
    res.status(503).json({ error: 'Queue service temporarily unavailable' });
    return;
  }

  // Map Lua codes → HTTP for everyone who didn't win
  // These are logged as fire-and-forget audit entries below
  if (code === -4) {
    res.status(404).json({ error: 'Event not found' });
    return;
  }
  if (code === -3) {
    res.status(403).json({ error: 'Event is not active' });
    return;
  }
  if(code === -2) {
    res.status(429).json({ error: 'RATE_LIMITED', retryAfterMs: 1000 });

    prisma.queueAttempt.create({
      data: { saleEventId: '', userId, result: 'RATE_LIMITED', jti: null },
    }).catch(() => {});

    return;
  }
  if(code === -1) {
    res.status(401).json({ error: 'SOLD_OUT' });

    prisma.queueAttempt.create({
      data: { saleEventId: '', userId, result: 'SOLD_OUT', jti: null },
    }).catch(() => {});

    return;
  }

  const eventData = await getEventEntry(publicKey);

  if (!eventData) {
    // Extremely rare: event was ended between Lua passing and this line.
    // Stock was already decremented — release it back.
    await redis.hincrby(`flash:event:${publicKey}`, 'stock', 1).catch(() => {});
    res.status(410).json({ error: 'Event no longer active' });
    return;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 4 — Generate a signed JWT with a unique `jti` (JWT ID)
  // ══════════════════════════════════════════════════════════════════════════
  //
  // WHAT IS `jti`?
  //   The `jti` (JWT ID) claim is a UUID that uniquely identifies this specific
  //   token.  It is the cornerstone of the double-spend shielding mechanism.
  //
  // DOUBLE-SPEND SHIELD FLOW:
  //   1. We issue a JWT containing jti = uuidv4().
  //   2. The end-user presents this JWT to the B2B client's checkout backend.
  //   3. The client's backend calls our POST /api/verify endpoint.
  //   4. Our verify endpoint:
  //        a) Validates the JWT signature.
  //        b) Checks if jti is in the UsedJti table (Postgres).
  //        c) If NOT present: INSERT INTO UsedJti (jti, …) → return 200 OK.
  //        d) If ALREADY present: return 409 Conflict → ticket already used.
  //   5. The Postgres INSERT uses the `jti` as the primary key (guaranteed unique).
  //      Two concurrent verify calls race to insert — the second one gets a
  //      unique constraint violation, which maps to 409.  No distributed lock needed.
  //
  // WHY NOT REDIS FOR jti STORAGE?
  //   Redis is not the right durability boundary.  A Redis restart or eviction
  //   would clear the used-jti set, allowing replay attacks.  Postgres gives us
  //   durability guarantees (WAL) appropriate for financial audit data.
  //
  // JWT PAYLOAD DESIGN:
  //   Keep the payload minimal — JWTs are base64-encoded and sent with every
  //   HTTP request.  Don't embed PII (email, name) inside the token.
  //   The `sub` subject claim should be an opaque identifier only.

  const jti = uuidv4();

  const sign = createSigner({
    key:       eventData.secretKey,
    algorithm: 'HS256',
    expiresIn: JWT_EXPIRY_SEC * 1000, // fast-jwt takes milliseconds, not seconds
  });

  const token = sign({
    jti,
    sub: userId,
    pk:  publicKey,
    eid: eventData.eventId,
  });
  

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 5 — Fire-and-forget audit log (DO NOT AWAIT)
  // ══════════════════════════════════════════════════════════════════════════
  //
  // TODO: Uncomment when Prisma models are ready:
  //
  //   prisma.queueAttempt.create({
  //     data: {
  //       saleEventId: event.id,   // TODO: pass event.id from Step 2 lookup
  //       userId,
  //       result: 'WON',
  //       jti,
  //     },
  //   }).catch(err => console.error('[audit] QueueAttempt write failed:', err));
  //
  // By not awaiting this, we don't block the response.  The latency cost of
  // a Postgres insert (~5-20ms) is NOT added to the user's response time.

    // DO NOT AWAIT — Postgres latency (~5-20ms) must never block this response.
  // If this write fails, user already won. Log and move on.
  prisma.queueAttempt.create({
    data: {
      saleEventId: eventData.eventId,
      userId,
      result:      'WON',
      jti,
    },
  }).catch(err => console.error('[audit] QueueAttempt write failed:', err));

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 6 — Respond
  // ══════════════════════════════════════════════════════════════════════════

  res.status(200).json({
    result:    'WON',
    token,
    expiresIn: JWT_EXPIRY_SEC,
  });
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

  const secretKeyHeader = req.headers['x-secret-key'] as string | undefined;
  const { token } = req.body as { token?: string };

  if (!secretKeyHeader || !token) {
    res.status(400).json({
      error: '`token` in body and `x-secret-key` header are required',
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
    // fast-jwt: decode only, no verification
    const decode = createVerifier({ key: async () => '', algorithms: ['HS256'], ignoreExpiration: true });
    // Simpler approach — just use Buffer to decode the JWT payload section
    const payloadB64 = token.split('.')[1];
    if (!payloadB64) throw new Error('Malformed token');
    unverifiedPayload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch {
    res.status(400).json({ error: 'Malformed token' });
    return;
  }

  const { pk: publicKey, eid: eventId } = unverifiedPayload;

  if(!publicKey || !eventId){
    res.status(400).json({ error: 'Token missing required claims' });
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

  if (secretKeyHeader !== eventData.secretKey) {
    res.status(401).json({ error: 'Invalid secret key' });
    return;
  }

  // ── Step 4: Verify JWT signature with fast-jwt ───────────────────────────────
  //
  // createVerifier() with the real secretKey. This confirms:
  //   a) Signature is valid (token was signed by us with this event's secret)
  //   b) Token hasn't expired (exp claim)
  // Throws on any failure — caught below.


  let verified: { jti: string; sub: string; exp: number };

  try {
    const verify = createVerifier({
      key:        async () => eventData.secretKey,
      algorithms: ['HS256'],
    });

    verified = await verify(token) as typeof verified;
  } catch (err: any) {
    if (err.code === 'FAST_JWT_EXPIRED') {
      res.status(401).json({ error: 'TOKEN_EXPIRED' });
      return;
    }
    res.status(401).json({ error: 'INVALID_TOKEN' });
    return;
  }

  if (!verified.jti) {
    res.status(400).json({ error: 'TOKEN_MISSING_JTI_CLAIM' });
    return;
  }

  // ── Step 5: Atomically consume jti — double-spend shield ────────────────────
  //
  // jti is the PRIMARY KEY of UsedJti.
  // Two concurrent verify calls both try to INSERT the same jti.
  // First succeeds → 200. Second gets P2002 (unique violation) → 409.
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
      res.status(409).json({ error: 'TOKEN_ALREADY_EXIST' });
      return;
    }
    console.error('[verify] UsedJti insert failed:', err);
    res.status(500).json({ error: 'VERIFICATION_FAILED' });
    return;
  }

  // ── Step 6: Respond ──────────────────────────────────────────────────────────

  res.status(200).json({
    verified:  true,
    userId:    verified.sub,
    eventId,
  });
}
