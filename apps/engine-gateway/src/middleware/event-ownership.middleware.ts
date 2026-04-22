// apps/engine-gateway/src/middleware/event-ownership.middleware.ts

import { Request, Response, NextFunction } from 'express';
import { getEventEntry }                   from '../services/event-cache.service';

// ── Extend Express Locals so res.locals.eventData is typed everywhere ─────────
//
// Express's default Locals type is `Record<string, any>` — fine for quick
// hacks but gives us zero IDE assistance downstream.  Augmenting the global
// Express namespace makes TypeScript aware of our custom field on every
// Response in this project without requiring a type cast at every use site.
//
// Placed here (closest to its definition) rather than in a global .d.ts file
// so the shape stays co-located with the middleware that sets it.

declare global {
  namespace Express {
    interface Locals {
      // Populated by requireEventOwnership before the release controller runs.
      // Controllers must not call getEventEntry() again — read from here instead.
      eventData: {
        rsaPrivateKey: string;
        rsaPublicKey:  string;
        signingSecret: string;
        eventId:       string;
        name:          string;
      };
    }
  }
}

// ── requireEventOwnership ─────────────────────────────────────────────────────
//
// Applied only to POST /api/queue/release.
//
// PURPOSE (why this middleware exists AT ALL):
//   The release route is HMAC-authenticated: only a caller who knows the
//   signingSecret can pass.  But the HMAC check lives in the controller and
//   requires the signingSecret, which comes from the event cache.  Without this
//   middleware the controller would:
//     1. Look up the event by publicKey.          ← Step 3 in controller today
//     2. Return 404 if not found.
//     3. Then verify the HMAC with the secret.
//
//   There are two concrete problems with that order:
//
//   a) SECURITY — HMAC check before existence check:
//      If an attacker sends a request with a made-up x-public-key, the
//      controller would look it up, find nothing, and return 404.  That's fine.
//      But it means the HMAC verification is skipped entirely — we never even
//      confirmed the event exists before deciding what to do.  Splitting the
//      existence check into middleware makes the control flow explicit:
//      existence gate → HMAC gate → business logic.
//
//   b) DRY / performance — avoid double lookup:
//      The controller needs the event data (signingSecret, eventId) anyway.
//      By stashing it in res.locals here, the controller skips a second
//      getEventEntry() call.  The Node cache makes this O(1) either way, but
//      eliminating the redundant call keeps the code cleaner and the intent
//      unambiguous.
//
// WHAT "OWNERSHIP" MEANS HERE:
//   We do NOT verify that the caller is the human who created the event
//   (that would require user sessions).  We verify that the x-public-key
//   header refers to a currently ACTIVE event — i.e., only a caller who was
//   given valid credentials for that event at creation time would know which
//   publicKey and signingSecret to use together.

export async function requireEventOwnership(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const publicKey = req.headers['x-public-key'];

  // Reject immediately if the header is missing or malformed (array form).
  if (typeof publicKey !== 'string') {
    res.status(400).json({ error: 'Missing x-public-key header' });
    return;
  }

  // getEventEntry() checks the in-process Map (O(1)) first.
  // On a cache miss it queries Postgres once and populates the cache.
  // Returns null for unknown keys AND for non-ACTIVE events (handled in the
  // cache service — see event-cache.service.ts line 38).
  const eventData = await getEventEntry(publicKey);

  if (!eventData) {
    // 404 rather than 403: we don't confirm the key exists at all, which
    // avoids leaking whether a given publicKey is valid-but-inactive vs
    // completely unknown.  An attacker learns nothing either way.
    res.status(404).json({ error: 'Event not found or not active' });
    return;
  }

  // Attach to res.locals so downstream middleware and the controller can read
  // it without fetching again.  The type is enforced by the Locals augmentation
  // declared above.
  res.locals.eventData = eventData;

  next();
}
