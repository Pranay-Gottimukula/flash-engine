// apps/engine-gateway/src/controllers/release.controller.ts

import { Request, Response } from 'express';
import crypto                from 'crypto';
import redis                 from '../services/redis.service';
import prisma                from '../lib/prisma';
// getEventEntry is NOT called here — requireEventOwnership middleware runs
// before this handler and attaches the validated event to res.locals.eventData.

// ── POST /api/queue/release ───────────────────────────────────────────────────
//
// Called by the CLIENT'S BACKEND when a winning ticket expires unused.
// Puts one unit of stock back into the Redis counter so another user can win.
//
// WHY THIS NEEDS HMAC AUTHENTICATION:
//   Without it, anyone who knows this URL can spam fake release requests
//   and inflate the stock counter beyond the original stockCount.
//   That means more winners than inventory — exactly what we're built to prevent.
//
// REQUEST:
//   POST /api/queue/release
//   Headers:
//     x-public-key:    pk_live_...
//     x-signature:     sha256=<hmac hex>
//     x-timestamp:     <unix ms>
//   Body:
//     { jti: string, reason: "EXPIRED" | "CANCELLED" | "PAYMENT_FAILED" }
//
// HMAC CONSTRUCTION (client must replicate this exactly):
//   const body      = JSON.stringify({ jti, reason });
//   const timestamp = Date.now().toString();
//   const message   = `${timestamp}.${body}`;
//   const signature = crypto.createHmac('sha256', secretKey)
//                           .update(message)
//                           .digest('hex');
//   headers: { 'x-signature': `sha256=${signature}`, 'x-timestamp': timestamp }

export async function releaseTicket(req: Request, res: Response): Promise<void>{
    // ── Step 1: Extract headers + body ─────────────────────────────────────────

  const publicKey  = req.headers['x-public-key']  as string | undefined;
  const signature  = req.headers['x-signature']   as string | undefined;
  const timestamp  = req.headers['x-timestamp']   as string | undefined;

  const { jti, reason } = req.body as {
    jti?:    string;
    reason?: string;
  };

  if (!publicKey || !signature || !timestamp || !jti || !reason) {
    res.status(400).json({
      error: 'Missing required fields: x-public-key, x-signature, x-timestamp headers and jti, reason in body',
    });
    return;
  }

  const validReasons = ['EXPIRED', 'CANCELLED', 'PAYMENT_FAILED'];
  if (!validReasons.includes(reason)) {
    res.status(400).json({
      error: `reason must be one of: ${validReasons.join(', ')}`,
    });
    return;
  }

  // ── Step 2: Replay attack prevention — reject stale timestamps ──────────────
  //
  // If we only check the HMAC signature, an attacker who intercepts a valid
  // release request can replay it hours later to keep inflating stock.
  // Rejecting requests older than 5 minutes closes this window.
  //
  // Client clock skew up to ~30 seconds is normal — the 5 minute window
  // is generous enough to handle that without being exploitable.

  const tsMs = parseInt(timestamp, 10);

  if (isNaN(tsMs)) {
    res.status(400).json({ error: 'x-timestamp must be a unix millisecond integer' });
    return;
  }

  const ageMs = Date.now() - tsMs;

  if (ageMs > 5 * 60 * 1000) {
    res.status(401).json({ error: 'Request timestamp too old — possible replay attack' });
    return;
  }

  if (ageMs < -30_000) {
    // Timestamp is in the future — clock skew too large or manipulation
    res.status(401).json({ error: 'Request timestamp is in the future' });
    return;
  }

  // ── Step 3: Read event data from res.locals ──────────────────────────────────
  //
  // requireEventOwnership (queue.routes.ts) already called getEventEntry() and
  // confirmed the event is ACTIVE before this handler ran.  Reading from
  // res.locals is O(1) with no I/O — no reason to hit the cache a second time.
  //
  // TypeScript knows the shape of res.locals.eventData because Express.Locals
  // is augmented in event-ownership.middleware.ts.

  const eventData = res.locals.eventData;

  // ── Step 4: Verify HMAC signature ───────────────────────────────────────────
  //
  // Reconstruct the exact message the client signed:
  //   message = `${timestamp}.${rawBodyString}`
  //
  // WHY timingSafeEqual?
  //   A naive `===` string comparison short-circuits on the first mismatched
  //   character. An attacker can measure response times to guess the signature
  //   one character at a time (timing attack).
  //   timingSafeEqual always compares all bytes regardless of where they differ.

  const rawBody         = JSON.stringify({ jti, reason });
  const message         = `${timestamp}.${rawBody}`;
  const expectedHmac    = crypto
                            .createHmac('sha256', eventData.signingSecret)
                            .update(message)
                            .digest('hex');
  const expectedSig     = `sha256=${expectedHmac}`;
  const providedSig     = signature;

  // Buffers must be same length for timingSafeEqual — pad check first
  if (expectedSig.length !== providedSig.length) {
    res.status(401).json({ error: 'Invalid signature' });
    return;
  }

  const signaturesMatch = crypto.timingSafeEqual(
    Buffer.from(expectedSig,  'utf8'),
    Buffer.from(providedSig,  'utf8'),
  );

  if (!signaturesMatch) {
    res.status(401).json({ error: 'Invalid signature' });
    return;
  }

  // ── Step 5: Verify the jti exists and was actually a winner ─────────────────
  //
  // We check QueueAttempt to confirm this jti was legitimately issued.
  // Without this check, a client could release stock for a made-up jti,
  // inflating stock beyond the original stockCount.
  //
  // Two valid states for a releasable jti:
  //   a) Present in QueueAttempt with result=WON but NOT in UsedJti
  //      → won but never verified (user abandoned checkout)
  //   b) Present in QueueAttempt with result=WON and in UsedJti
  //      → won and verified but payment failed afterward
  //
  // Already released = present in TicketRelease table → reject as duplicate.

  const [attempt, alreadyReleased] = await Promise.all([
    prisma.queueAttempt.findFirst({
      where: { jti, saleEventId: eventData.eventId, result: 'WON' },
    }),
    prisma.ticketRelease.findFirst({
      where: { jti },
    }),
  ]);

  if (!attempt) {
    res.status(404).json({ error: 'No winning ticket found for this jti' });
    return;
  }

  if (alreadyReleased) {
    res.status(409).json({ error: 'Ticket already released' });
    return;
  }

  // ── Step 6: Increment Redis stock + log release atomically ──────────────────
  //
  // We can't wrap a Redis call and a Postgres write in a true transaction,
  // so we do Redis first, then Postgres.
  //
  // WHY Redis first?
  //   If Redis succeeds but Postgres fails → stock is back in Redis (good),
  //   TicketRelease row is missing (bad but retryable — client retries and
  //   the duplicate check catches it since stock is already back).
  //
  //   If Postgres succeeds but Redis fails → stock is NOT back, TicketRelease
  //   row exists. This is worse — inventory is permanently lost for this unit.
  //   Redis first avoids this worse failure mode.
  //
  // HINCRBY is atomic — no race with concurrent join requests decrementing.

  const redisKey = `flash:event:${publicKey}`;

  try {
    await redis.hincrby(redisKey, 'stock', 1);
  } catch (err) {
    console.error('[release] Redis stock increment failed:', err);
    res.status(503).json({ error: 'Failed to release stock — Redis unavailable' });
    return;
  }

  // ── Step 7: Log to TicketRelease (audit trail) ──────────────────────────────
  //
  // This is awaited (not fire-and-forget) because it's the duplicate-release
  // guard. If we don't await it, two concurrent release requests for the same
  // jti could both pass the duplicate check in Step 5 and both increment stock.

  try {
    await prisma.ticketRelease.create({
      data: {
        saleEventId: eventData.eventId,
        jti,
        reason,
      },
    });
  } catch (err: any) {
    // If this fails after Redis already incremented, log loudly for manual fix
    // Stock is already back in Redis so inventory isn't permanently lost,
    // but the audit trail has a gap.
    console.error(
      `[release] CRITICAL: Redis incremented but TicketRelease write failed. ` +
      `jti=${jti} eventId=${eventData.eventId}. Manual audit required.`,
      err,
    );
    // Still return 200 — stock was successfully returned, which is the
    // primary goal. The audit gap is an ops problem, not a client error.
    res.status(200).json({
      released: true,
      warning:  'Stock returned but audit log failed — contact support',
    });
    return;
  }

  // ── Step 8: Respond ──────────────────────────────────────────────────────────

  res.status(200).json({
    released: true,
    jti,
    reason,
  });
}