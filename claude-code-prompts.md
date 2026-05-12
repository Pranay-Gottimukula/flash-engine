# Flash Sale Engine — Claude Code Prompts

## Important: Feed these prompts sequentially. Wait for each to complete and verify before moving to the next.

---

## PHASE 1 — Queue-Aware Lua Script & Redis Restructure

### Prompt 1.1 — New Redis data structures and updated event seeding

```
I'm building a flash sale engine. Read the full codebase first before making any changes.

Context: Right now the leaky bucket Lua script permanently rejects users with RATE_LIMITED when the bucket is empty, even if stock is available. I'm adding a server-side queue using Redis sorted sets so that rate-limited users wait in line instead of being rejected.

Here's what needs to change in the Redis data model:

EXISTING hash `flash:event:{publicKey}` — keep all current fields (status, stock, rateLimit, bucketTokens, bucketLastRefill, eventId). Add two new fields:
- `admitted` — integer counter, starts at 0. Tracks total users admitted to queue + instant winners.
- `queueCap` — integer, equals `stockCount * oversubscriptionMultiplier`. The max users allowed into the system.

NEW sorted set `flash:queue:{publicKey}` — members are userId strings, scores are arrival timestamps in milliseconds. This is the waiting queue ordered by arrival time.

NEW hash `flash:result:{publicKey}` — fields are userId strings, values are result strings: "WON", "SOLD_OUT", or absent (still queued).

Changes needed:

1. Update the Prisma schema — add `oversubscriptionMultiplier` field to `SaleEvent` model with `@default(1.5)` and type `Float`.

2. In `admin.controller.ts` `createEvent()`:
   - Accept `oversubscriptionMultiplier` in the request body (optional, default 1.5, validate between 1.0 and 3.0).
   - Compute `queueCap = Math.ceil(stockCount * oversubscriptionMultiplier)`.
   - When seeding the Redis hash, include the two new fields: `admitted: '0'` and `queueCap: String(queueCap)`.
   - Save `oversubscriptionMultiplier` to Postgres.

3. In `admin.controller.ts` `endEvent()`:
   - After setting status to ENDED in Redis, also delete the sorted set `flash:queue:{publicKey}` and the result hash `flash:result:{publicKey}`.
   - Use a Redis pipeline for the cleanup.

4. Run `npx prisma migrate dev --name add-oversubscription-multiplier` after schema change.

Do NOT touch the Lua script yet — that's the next prompt. Do NOT change the queue controller yet.
```

### Prompt 1.2 — Rewrite the Lua script for queue admission

```
Read the current leaky-bucket.lua script and the redis.service.ts file.

Replace the Lua script with a new version that handles both instant wins AND queue admission atomically. The script must be a single atomic Redis operation.

The new Lua script receives:
- KEYS[1] = "flash:event:{publicKey}" (the event hash)
- KEYS[2] = "flash:queue:{publicKey}" (the sorted set queue)
- KEYS[3] = "flash:result:{publicKey}" (the result hash)
- ARGV[1] = nowMs (current timestamp in milliseconds)
- ARGV[2] = userId (string)

Logic flow (must be exactly this order):

1. HMGET from KEYS[1]: status, stock, rateLimit, bucketTokens, bucketLastRefill, admitted, queueCap
2. If status is nil/false → return {-4, "EVENT_NOT_FOUND"}
3. If status ~= "ACTIVE" → return {-3, "EVENT_NOT_ACTIVE"}
4. Check duplicate: ZSCORE KEYS[2] for userId. If exists → return {-5, "ALREADY_JOINED"}
5. Check duplicate: HEXISTS KEYS[3] for userId. If exists → return {-5, "ALREADY_JOINED"}
6. If admitted >= queueCap → return {-1, "SOLD_OUT"}
7. Leaky bucket refill calculation (same math as current script):
   - elapsed = nowMs - bucketLastRefill
   - refilled = (elapsed / 1000) * rateLimit
   - tokens = math.min(rateLimit, bucketTokens + refilled)
8. If tokens >= 1 AND stock > 0:
   - This is an INSTANT WIN. Decrement stock, consume one token, increment admitted.
   - HSET KEYS[1]: bucketTokens = tokens - 1, bucketLastRefill = nowMs, stock = stock - 1, admitted = admitted + 1
   - HSET KEYS[3]: userId = "WON"
   - return {1, "WON"}
9. If tokens < 1 OR stock <= 0 but admitted < queueCap:
   - ZADD KEYS[2] with score = nowMs, member = userId
   - HINCRBY KEYS[1] "admitted" 1
   - Get position via ZRANK KEYS[2] userId
   - return {0, "QUEUED", position}

Important edge case in step 9: if stock <= 0 but admitted < queueCap, still queue them. Stock might be released later via the release route. The drain loop will mark them SOLD_OUT if stock is truly exhausted.

In redis.service.ts:
- Update the defineCommand registration — the new script has numberOfKeys: 3 instead of 1.
- Update the TypeScript call signature. The command now takes (eventKey, queueKey, resultKey, nowMs, userId).
- Export a helper function `getRedisKeys(publicKey: string)` that returns { eventKey, queueKey, resultKey } with the correct prefixes.

Name the new lua file `queue-admission.lua` (keep the old `leaky-bucket.lua` for reference but don't register it).

Do NOT change the queue controller yet.
```

### Prompt 1.3 — Update the queue controller for new Lua responses

```
Read the updated Lua script and redis.service.ts.

Update `queue.controller.ts` `joinQueue()` handler to work with the new Lua script return values.

Current flow: calls leakyBucket lua → gets WON or rejection → if WON, signs JWT and returns it.

New flow:

1. Extract `publicKey` and `userId` from request body. Both required, validate presence.
2. Call the new Lua command with all three Redis keys + nowMs + userId.
3. Handle return codes:

   - Code 1 (WON): Same as before. Fetch rsaPrivateKey from event cache, sign JWT with fast-jwt (RS256), fire-and-forget QueueAttempt audit log. Return 200 with { status: "WON", token: jwt }.

   - Code 0 (QUEUED): Fire-and-forget QueueAttempt with result "QUEUED". Return 202 with { status: "QUEUED", position: returnedPosition, pollUrl: "/api/queue/status?pk={publicKey}&userId={userId}", pollIntervalMs: 2000 }.

   - Code -1 (SOLD_OUT): Fire-and-forget QueueAttempt with result "SOLD_OUT". Return 200 with { status: "SOLD_OUT" }.

   - Code -3 (EVENT_NOT_ACTIVE): Return 400 with { error: "EVENT_NOT_ACTIVE" }.

   - Code -4 (EVENT_NOT_FOUND): Return 404 with { error: "EVENT_NOT_FOUND" }.

   - Code -5 (ALREADY_JOINED): Don't create another audit log. Return 200 with { status: "ALREADY_JOINED", pollUrl: "/api/queue/status?pk={publicKey}&userId={userId}" }.

Important: The WON case still needs the event cache for rsaPrivateKey. Call getEventEntry(publicKey) — if cache miss, it falls back to Postgres. This only happens for instant winners, not queued users, so Postgres load is minimal.

Do NOT create the polling endpoint yet — that's a separate prompt.
```

---

## PHASE 2 — Server-Side Drain Loop

### Prompt 2.1 — Drain service

```
Read the full codebase, especially redis.service.ts, event-cache.service.ts, and the updated Lua script.

Create a new file `src/services/drain.service.ts` that processes the Redis sorted set queue at a controlled rate.

Design:

This is a single-server setup (no Kubernetes, no multi-pod coordination). The drain loop is a simple setInterval.

Architecture:
- Module-level Map<string, NodeJS.Timeout> called `activeDrains` — maps publicKey to interval ID.
- Each active event gets its own drain interval.

Function: `startDrain(publicKey: string, rateLimit: number)`
- Calculate interval: drain once per second using batch approach.
- setInterval every 1000ms that calls `drainBatch(publicKey, rateLimit)`.
- Store the interval ID in activeDrains map.
- If already draining this publicKey, do nothing (idempotent).

Function: `stopDrain(publicKey: string)`
- clearInterval using stored ID.
- Remove from activeDrains map.

Function: `drainBatch(publicKey: string, batchSize: number)`
- Call ZCARD on `flash:queue:{publicKey}`. If 0, return early (no one waiting).
- Call ZPOPMIN with count = batchSize to pop up to `batchSize` users in one atomic call.
- For each popped user (userId, timestamp):
  - Check stock: HGET `flash:event:{publicKey}` "stock"
  - If stock > 0:
    - HINCRBY `flash:event:{publicKey}` "stock" -1
    - HSET `flash:result:{publicKey}` userId "WON"
    - Generate JWT: get rsaPrivateKey from event cache, sign with fast-jwt. Store the JWT in a Redis key `flash:ticket:{publicKey}:{userId}` with 900 second TTL (15 minutes).
    - Fire-and-forget QueueAttempt with result "WON".
  - If stock <= 0:
    - HSET `flash:result:{publicKey}` userId "SOLD_OUT"
    - Fire-and-forget QueueAttempt with result "SOLD_OUT".
    - Also drain the rest of the sorted set: ZPOPMIN everything remaining, mark all as SOLD_OUT in the result hash, log audit for each.

IMPORTANT: The stock check + decrement for each user in the batch must be atomic. Write a small Lua script `drain-process.lua` that takes the event key, result key, and userId, checks stock, decrements if available, writes result, and returns 1 for WON or -1 for SOLD_OUT. The JWT generation and ticket storage happen in Node after the Lua returns (since you can't do RSA signing in Lua).

Function: `initDrains()`
- Called once at server startup in server.ts.
- Query Postgres for all SaleEvents where status = "ACTIVE".
- Call startDrain for each one.

Integration points (do NOT modify these files yet, just add TODO comments for where to call):
- admin.controller.ts activateEvent() should call startDrain()
- admin.controller.ts endEvent() should call stopDrain()
- server.ts should call initDrains() after Redis and Postgres are connected

Export: startDrain, stopDrain, initDrains, getActiveDrains (for health endpoint).
```

### Prompt 2.2 — Integrate drain service with admin controller and server

```
Read drain.service.ts, admin.controller.ts, and server.ts.

Make these integrations:

1. In admin.controller.ts `activateEvent()`:
   - After the Node cache is warmed (the final step), call `startDrain(saleEvent.publicKey, saleEvent.rateLimit)`.
   - Import startDrain from drain.service.ts.

2. In admin.controller.ts `endEvent()`:
   - Before evicting the Node cache, call `stopDrain(publicKey)`.
   - Import stopDrain from drain.service.ts.

3. In server.ts:
   - After both Redis and Prisma are connected and the server is listening, call `initDrains()`.
   - Import initDrains from drain.service.ts.
   - Wrap in try-catch — if initDrains fails, log the error but don't crash the server. Events can be re-activated manually.

4. Add graceful shutdown in server.ts:
   - Listen for SIGTERM and SIGINT.
   - On signal: stop all active drains (iterate activeDrains map), close Redis connection, disconnect Prisma, then process.exit(0).
   - Give in-flight requests 5 seconds to complete before force-exiting.

Do NOT change the Lua scripts or the queue controller.
```

---

## PHASE 3 — Polling Endpoint

### Prompt 3.1 — Queue status endpoint

```
Read queue.controller.ts, queue.routes.ts, and redis.service.ts.

Add a polling endpoint for queued users to check their result.

Route: GET /api/queue/status
Query params: pk (string, required), userId (string, required)

Controller function: `getQueueStatus(req, res)`

Logic:
1. Validate pk and userId are present. Return 400 if missing.
2. Check result hash: HGET `flash:result:{pk}` userId
3. If result === "WON":
   - Fetch the JWT from `flash:ticket:{pk}:{userId}` (HGET or GET depending on how drain service stores it).
   - If JWT exists: return 200 { status: "WON", token: jwt }
   - If JWT expired/missing: return 200 { status: "WON", tokenExpired: true } (user took too long)
4. If result === "SOLD_OUT":
   - Return 200 { status: "SOLD_OUT" }
5. If result is null (not in result hash):
   - Check if user is in the queue: ZRANK `flash:queue:{pk}` userId
   - If rank is not null: return 200 { status: "QUEUED", position: rank + 1 } (ZRANK is 0-indexed)
   - If rank is null: return 404 { error: "NOT_FOUND" } (user never joined)

Important:
- This endpoint ONLY reads from Redis. Zero Postgres queries.
- No authentication needed — the userId is opaque and knowing someone else's userId + publicKey only tells you their queue position, not their JWT.
- Add this route to queue.routes.ts as GET /api/queue/status.

Also update the joinQueue handler: when a user gets ALREADY_JOINED (code -5), also check the result hash in case they already won or got sold out while we were processing. Return their current status instead of just "ALREADY_JOINED".
```

---

## PHASE 4 — Release Route Integration

### Prompt 4.1 — Verify release works with queue system

```
Read release.controller.ts and the drain service.

The release route (POST /api/queue/release) already does HMAC verification and HINCRBY stock 1 to increment stock back. With the new queue system, this needs minor updates:

1. After incrementing stock in Redis (HINCRBY), check if there are users still waiting in the sorted set:
   - ZCARD `flash:queue:{publicKey}`
   - If ZCARD > 0, the drain loop will automatically pick them up on its next tick since stock is now available again. No additional action needed. Just log: "Stock released, {zcard} users still in queue — drain loop will process."
   - If ZCARD === 0, log: "Stock released but queue is empty — stock will remain available until event ends."

2. Edge case: If the drain loop has already stopped (because it saw stock = 0 and emptied the queue by marking everyone SOLD_OUT), but then stock is released, the drain has nothing to process. This is the "sale is done when queue empties" design decision.

   Handle this: In the release controller, after HINCRBY, check ZCARD. If ZCARD > 0 but the drain is not running for this event (import getActiveDrains from drain.service.ts and check), restart it with startDrain(). This handles the edge case where drain stopped but stock came back.

3. In the TicketRelease creation, also add a fire-and-forget QueueAttempt record with result "RELEASED" for the jti being released. This keeps the audit trail complete.

4. Make sure the existing HMAC verification, timestamp check, and duplicate release prevention all still work correctly with the new Redis key structure. The release route reads from flash:event:{publicKey} which hasn't changed structurally — it just has new fields that the release route doesn't need to touch.

Do NOT change the Lua scripts, drain service, or polling endpoint.
```

---

## PHASE 6 (Backend Only) — Admin Stats Endpoint

### Prompt 6.1 — Stats endpoint for dashboard

```
Read admin.controller.ts and admin.routes.ts.

Add a new endpoint for the dashboard to display live event analytics.

Route: GET /api/admin/events/:id/stats
Middleware: requireAdminSecret (same as other admin routes)

Controller function: `getEventStats(req, res)`

Logic:
1. Fetch the SaleEvent from Postgres by id. Return 404 if not found.
2. Get live Redis data:
   - HMGET `flash:event:{publicKey}`: stock, admitted, queueCap, status
   - ZCARD `flash:queue:{publicKey}`: current queue length (users still waiting)
3. Get aggregate counts from Postgres (these can be slightly stale, that's fine):
   - Count QueueAttempts grouped by result: WON, QUEUED, SOLD_OUT, RATE_LIMITED
   - Count TicketReleases grouped by reason: EXPIRED, CANCELLED, PAYMENT_FAILED
   - Count UsedJti records (successful payment verifications)
4. Compute derived metrics:
   - totalRequests = sum of all QueueAttempt counts
   - conversionRate = usedJtiCount / wonCount (people who won AND completed payment)
   - stockRemaining = stock from Redis
   - queueDepth = ZCARD result
   - releaseRate = totalReleases / wonCount

Return 200 with:
{
  event: { id, name, status, stockCount, rateLimit, oversubscriptionMultiplier, createdAt },
  live: { stockRemaining, queueDepth, admitted, queueCap },
  funnel: { totalRequests, queued, instantWins, soldOut, rateLimited, won, released, verified },
  rates: { conversionRate, releaseRate }
}

Use Prisma groupBy for the aggregate queries. Run Redis and Postgres queries in parallel with Promise.all for speed.

Add the route to admin.routes.ts.
```

### Prompt 6.2 — List events endpoint

```
Read admin.controller.ts and admin.routes.ts.

Add an endpoint to list all events for the dashboard.

Route: GET /api/admin/events
Middleware: requireAdminSecret

Controller function: `listEvents(req, res)`

Logic:
1. Query all SaleEvents from Postgres, ordered by createdAt descending.
2. Include basic counts using Prisma's _count:
   - _count: { attempts: true, releases: true, usedJtis: true }
3. For each ACTIVE event, also fetch live stock from Redis (HGET flash:event:{publicKey} stock). For non-active events, use stockCount from Postgres.
4. Do NOT return rsaPrivateKey or signingSecret in the response. Only return: id, name, status, stockCount, rateLimit, oversubscriptionMultiplier, publicKey, rsaPublicKey, createdAt, and the counts.

Return 200 with array of events.

Add the route to admin.routes.ts as GET /api/admin/events.
```

### Prompt 6.3 — Get single event with keys (display once pattern)

```
Read admin.controller.ts.

Add an endpoint to get a single event's full details including sensitive keys. This is used by the dashboard's "display keys once" page right after event creation.

Route: GET /api/admin/events/:id
Middleware: requireAdminSecret

Controller function: `getEvent(req, res)`

Logic:
1. Fetch SaleEvent by id from Postgres. Return 404 if not found.
2. Return ALL fields including rsaPublicKey and signingSecret.
3. Do NOT return rsaPrivateKey — the client never needs this. It stays in the engine.
4. Include a field `integrationSnippet` that returns a string with example code showing how to use the SDK:

```js
const snippet = `
// Install: npm install @flash-sale/sdk

// Browser-side (your storefront)
import { FlashSale } from '@flash-sale/sdk';

const sale = new FlashSale({
  publicKey: '${event.publicKey}',
  apiUrl: '${process.env.API_URL || 'https://api.flashsale.dev'}'
});

sale.join(userId, {
  onQueued: (position) => showQueuePosition(position),
  onWon: (token) => redirectToCheckout(token),
  onSoldOut: () => showSoldOutMessage()
});

// Server-side (your payment backend) — verify the token
const response = await fetch('${process.env.API_URL || 'https://api.flashsale.dev'}/api/queue/verify', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-public-key': '${event.publicKey}'
  },
  body: JSON.stringify({ token: tokenFromClient })
});
`;
```

Add the route to admin.routes.ts as GET /api/admin/events/:id.
```
