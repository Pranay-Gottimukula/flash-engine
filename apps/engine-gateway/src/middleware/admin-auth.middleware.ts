// apps/engine-gateway/src/middleware/admin-auth.middleware.ts

import { Request, Response, NextFunction } from 'express';
import crypto                              from 'crypto';

// ── requireAdminSecret ────────────────────────────────────────────────────────
//
// Protects all /api/admin/* routes so only our own dashboard server can call
// them — not random internet traffic.
//
// AUTHENTICATION MODEL:
//   The flash-dashboard is a server-side Next.js app that can safely store a
//   shared secret (ADMIN_SECRET env var).  It sends that secret in every
//   admin request via the x-admin-secret header.  The gateway reads the same
//   env var and compares the two.
//
//   This is a simple shared-secret scheme — appropriate here because:
//     a) The dashboard is the ONLY caller of admin routes; there are no
//        third-party integrators or end users hitting /api/admin/*.
//     b) The secret travels over TLS in production, so it is not exposed in
//        transit.
//     c) mTLS or OAuth would add infra complexity for no practical gain.
//
// TIMING SAFETY:
//   We use crypto.timingSafeEqual instead of === because string equality in
//   JavaScript short-circuits on the first mismatched character.  An attacker
//   who can measure response latency at high precision could use that to guess
//   the secret one character at a time (timing oracle).
//   timingSafeEqual always compares every byte regardless of where they differ.
//
// STARTUP GUARD:
//   We check for ADMIN_SECRET at module-load time, not per-request.  If it is
//   missing the server MUST NOT start — an unguarded admin API is worse than
//   a crash.  This mirrors how the rest of the codebase treats missing env vars
//   (DATABASE_URL, REDIS_URL) in bootstrap().

const rawSecret = process.env.ADMIN_SECRET;

if (!rawSecret) {
  // Crash loudly so the misconfiguration is impossible to miss in logs.
  console.error(
    '❌ FATAL: ADMIN_SECRET environment variable is not set. ' +
    'Admin routes would be unprotected — refusing to start.',
  );
  process.exit(1);
}

// Pre-allocate the expected buffer once at startup rather than on each request.
// Buffer.from() allocates; doing it per-request under high admin traffic wastes
// GC cycles (minor concern given admin traffic volume, but zero cost to fix).
const expectedBuf = Buffer.from(rawSecret, 'utf8');

export function requireAdminSecret(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const provided = req.headers['x-admin-secret'];

  // Header missing or not a plain string (e.g. array — Express allows duplicate
  // headers as arrays).  Treat both as unauthenticated rather than throwing.
  if (typeof provided !== 'string') {
    res.status(401).json({ error: 'Missing x-admin-secret header' });
    return;
  }

  const providedBuf = Buffer.from(provided, 'utf8');

  // timingSafeEqual requires both buffers to be the SAME LENGTH.
  // If lengths differ we can reject immediately — the length itself is not
  // secret information an attacker can exploit to enumerate character counts
  // without already knowing the secret's length (which is public in env config).
  if (expectedBuf.length !== providedBuf.length) {
    res.status(401).json({ error: 'Invalid admin secret' });
    return;
  }

  const match = crypto.timingSafeEqual(expectedBuf, providedBuf);

  if (!match) {
    res.status(401).json({ error: 'Invalid admin secret' });
    return;
  }

  next();
}
