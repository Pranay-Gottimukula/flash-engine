// apps/engine-gateway/src/services/event-cache.service.ts

import prisma from '../lib/prisma';

// rsaPrivateKey replaces secretKey
// signingSecret added for release route HMAC
interface EventEntry {
  rsaPrivateKey:  string;   // PEM — signs JWTs
  rsaPublicKey:   string;   // PEM — verifies JWTs
  signingSecret:  string;   // HMAC secret for release route
  eventId:        string;
  name:           string;
}

// Module-level Map — lives in Node process RAM, not Redis
// Key: publicKey, Value: { secretKey, eventId }
const cache = new Map<string, EventEntry>();

export async function getEventEntry(publicKey: string): Promise<EventEntry | null> {
  // Return from in-process cache if available
  if (cache.has(publicKey)) {
    return cache.get(publicKey)!;
  }

  // Cache miss — hit Postgres once, then never again for this event
  const event = await prisma.saleEvent.findUnique({
    where:  { publicKey },
    select: {
      id:            true,
      rsaPrivateKey: true,
      rsaPublicKey:  true,
      signingSecret: true,
      name:          true,
      status:        true,
    },
  });

  if (!event || event.status !== 'ACTIVE') return null;

  const entry: EventEntry = {
    rsaPrivateKey:  event.rsaPrivateKey,
    rsaPublicKey:   event.rsaPublicKey,
    signingSecret:  event.signingSecret,
    eventId:        event.id,
    name:           event.name,
  };

  cache.set(publicKey, entry);
  return entry;
}


// ── Warm ──────────────────────────────────────────────────────────────────────
//
// Called explicitly from activateEvent() so the FIRST real user request
// hits the cache, not Postgres. Without this, the first request of the
// sale — usually the highest-traffic moment — takes an extra DB round trip.

export function warmEventCache(publicKey: string, entry: EventEntry){
    cache.set(publicKey, entry);
    console.log(`[event-cache] Warmed cache for event: ${entry.name} (${publicKey})`);
}

// ── Evict ─────────────────────────────────────────────────────────────────────
//
// Called from endEvent() so stale secretKeys don't sit in memory
// indefinitely after a sale ends.
export function evictEventCache(publicKey: string): void {
  const had = cache.has(publicKey);
  cache.delete(publicKey);
  if(had) console.log(`[event-cache] Evicted cache for key: ${publicKey}`);
}

// ── Inspect (for /health endpoint) ───────────────────────────────────────────
//
// Useful for debugging: how many events are currently cached?
// Add to your /health response so you can see cache state in production.

export function getCacheStats(){
    return {
    cachedEvents: cache.size,
    keys: [...cache.keys()].map(k => k.slice(0, 16) + '…'), // truncate for safety
  };
}