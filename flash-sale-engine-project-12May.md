# Flash Sale Engine — Project Context Document
> Authoritative handover document. Final state only. No history.

---

# 1. Architecture Overview

**What it is:** A multi-tenant B2B SaaS platform protecting e-commerce sites from database crashes and inventory overselling during high-traffic flash sales (10,000+ concurrent users). Clients sign up, create flash sale events, receive API keys, and integrate via SDK.

**Monorepo layout:**
```
/
├── apps/
│   ├── engine-gateway/     → Express + Redis + Postgres. Deployed to Railway.
│   └── saas-dashboard/     → Next.js 14 App Router. Deployed to Vercel.
└── packages/
    ├── browser-sdk/        → @flashengine/browser — ESM/CJS/UMD, zero deps, native fetch
    └── server-sdk/         → @flashengine/server — Node ≥18, zero deps, built-in crypto only
```

**Engine-gateway tech stack:**
- Node.js + TypeScript, Express
- Redis via ioredis — atomic Lua scripts (EVALSHA via `defineCommand`)
- PostgreSQL via Prisma (`@prisma/adapter-pg`)
- Purchase JWTs: `fast-jwt`, RS256, per-event 2048-bit RSA keypairs
- Auth JWTs: `fast-jwt`, HS256, global `AUTH_JWT_SECRET`
- Password hashing: bcrypt (rounds: 12)
- HMAC (release route): Node built-in `crypto`
- Redis provider: Upstash (free tier: 10,000 commands/day)

**Core request flow:**
```
Browser (@flashengine/browser SDK)
  │
  ├─► GET  /api/queue/info?pk=              Pure Redis. Pre-join queue state + estimatedWaitMs.
  │
  ├─► POST /api/queue/join                  queueJoinLimiter (5/10s/IP, skip: x-demo-bypass)
  │     └─ queue-admission.lua (atomic):
  │         Guard checks → queueCap ceiling → leaky bucket refill →
  │         WON (instant): decrement stock+tokens, HSET result "WON", return {1,"WON"}
  │         QUEUED: ZADD sorted set, return {0,"QUEUED",position,rateLimit}
  │         SOLD_OUT/errors: return negative codes
  │     └─ Controller: WON → sign RS256 JWT → 200 {status,token}
  │                    QUEUED → 202 {status,position,estimatedWaitMs,pollUrl}
  │
  ├─► GET  /api/queue/status?pk=&userId=    queueStatusLimiter (3/2s/IP, skip: x-demo-bypass)
  │     └─ HGET result hash → WON: GET flash:ticket:{pk}:{userId} → return JWT
  │                         → SOLD_OUT: return status
  │                         → null: ZRANK → position or NOT_FOUND
  │
  └─► Server-side drain loop (drain.service.ts)
        setInterval 1000ms per active event:
          ZCARD → skip if 0
          ZPOPMIN COUNT rateLimit → drain-process.lua per user →
            WON: sign JWT, SET flash:ticket:{pk}:{userId} EX 900
            SOLD_OUT (stock=0): drainRemainingAsSoldOut() bulk flush

Client Backend (@flashengine/server SDK)
  │
  ├─► POST /api/queue/verify                No auth, no rate limit
  │     └─ Verify RS256 sig → UsedJti.create (PK constraint = double-spend shield)
  │         Race: two concurrent calls → DB loser gets 409
  │
  └─► POST /api/queue/release               requireEventOwnership middleware (HMAC)
        └─ timingSafeEqual HMAC verify (5-min replay window) →
           HINCRBY stock +1 (atomic) →
           TicketRelease.create (AWAITED — duplicate guard) →
           fireWebhook if webhookUrl set
```

**Two user roles:**
- `CLIENT` — e-commerce company. `/dashboard`. Sees only own events.
- `SUPER_ADMIN` — platform operator. `/admin`. Sees all clients, all events, system health.

---

# 2. Cryptographic Key Management

| Key | Type | Stored In | Used For | Never In |
|-----|------|-----------|----------|----------|
| `rsaPrivateKey` | 2048-bit RSA PEM | Postgres + Node Map cache | Engine signs RS256 purchase JWTs | Redis, client |
| `rsaPublicKey` | 2048-bit RSA PEM | Postgres + Node cache + JWKS endpoint | Client backend verifies JWTs offline | — |
| `signingSecret` | 32-byte hex string | Postgres + Node cache | Client HMAC-signs release requests; engine verifies | Redis |
| `publicKey` (event) | cuid | Postgres + Redis hash field | Primary event identifier in all Redis keys and API calls | — |
| `AUTH_JWT_SECRET` | env var | Environment only | HS256 dashboard login tokens | DB, Redis |

**Node in-process cache (`event-cache.service.ts`):**
```ts
interface EventEntry {
  rsaPrivateKey: string;   // PEM — signs purchase JWTs
  rsaPublicKey:  string;   // PEM — verifies purchase JWTs
  signingSecret: string;   // HMAC secret for release route
  eventId:       string;   // SaleEvent.id for audit logs
  name:          string;
}
const cache = new Map<string, EventEntry>();
```

**Cache lifecycle:**
- `warmEventCache(pk, entry)` — called in `activateEvent()` after Postgres + Redis confirmed
- `evictEventCache(pk)` — called in `endEvent()` and `suspendClient()`
- `getEventEntry(pk)` — Map hit O(1), Postgres fallback on miss (ACTIVE events only)

**Write ordering (always):** Postgres → Redis → Node cache. Never reverse.

**Security decisions:**
- `rsaPrivateKey` and `signingSecret` deliberately never stored in Redis
- RS256 over HS256 for purchase tokens: client verifies with public key, never needs private
- Per-event keypairs: one event compromised does not affect others
- `generateKeyPairAsync` always used (never sync — blocks event loop ~100ms)

---

# 3. Database Schema

```prisma
generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["driverAdapters"]
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Client {
  id          String      @id @default(cuid())
  email       String      @unique
  password    String                            // bcrypt hash, rounds 12
  name        String?
  role        String      @default("CLIENT")    // "CLIENT" | "SUPER_ADMIN"
  suspended   Boolean     @default(false)
  publicKey   String      @unique               // client-level identifier
  createdAt   DateTime    @default(now())
  events      SaleEvent[]
}

model SaleEvent {
  id                         String    @id @default(cuid())
  clientId                   String
  name                       String
  stockCount                 Int
  rateLimit                  Int       @default(50)
  oversubscriptionMultiplier Float     @default(1.5)
  status                     String    @default("PENDING")  // PENDING|ACTIVE|PAUSED|ENDED
  mode                       String    @default("LIVE")     // "LIVE" | "TEST"
  publicKey                  String    @unique
  rsaPrivateKey              String    // PEM — signs JWTs, never leaves engine
  rsaPublicKey               String    // PEM — served via JWKS
  signingSecret              String    // HMAC secret for release route
  webhookUrl                 String?
  activatedAt                DateTime?
  endedAt                    DateTime?
  createdAt                  DateTime  @default(now())

  client      Client          @relation(fields: [clientId], references: [id])
  attempts    QueueAttempt[]
  releases    TicketRelease[]
  usedJtis    UsedJti[]
  webhookLogs WebhookLog[]
}

model QueueAttempt {
  id          String   @id @default(cuid())
  saleEventId String
  userId      String
  result      String   // WON|QUEUED|SOLD_OUT|RELEASED
  jti         String?
  createdAt   DateTime @default(now())

  saleEvent   SaleEvent @relation(fields: [saleEventId], references: [id])
  @@index([saleEventId])
  @@index([saleEventId, result])
}

model TicketRelease {
  id          String   @id @default(cuid())
  saleEventId String
  jti         String
  reason      String   // EXPIRED|CANCELLED|PAYMENT_FAILED
  releasedAt  DateTime @default(now())

  saleEvent   SaleEvent @relation(fields: [saleEventId], references: [id])
}

model UsedJti {
  jti         String   @id       // PRIMARY KEY — double-spend shield
  saleEventId String
  usedAt      DateTime @default(now())
  expiresAt   DateTime

  saleEvent   SaleEvent @relation(fields: [saleEventId], references: [id])
}

model WebhookLog {
  id          String   @id @default(cuid())
  saleEventId String
  event       String   // "activated"|"ended"|"paused"|"resumed"|"stock_released"
  url         String
  statusCode  Int?
  attempt     Int      @default(1)
  success     Boolean
  error       String?
  createdAt   DateTime @default(now())

  saleEvent   SaleEvent @relation(fields: [saleEventId], references: [id])
  @@index([saleEventId])
}
```

**Seed (`prisma/seed.ts`):** Upserts one `SUPER_ADMIN` using `SUPER_ADMIN_EMAIL` + `SUPER_ADMIN_PASSWORD` env vars. Safe to re-run.

**CLI tool:** `npm run create-admin` → `scripts/create-admin.ts` (interactive, bcrypt, upsert).

---

# 4. Core API Routes & Logic

## Rate Limiters (all in-memory, Redis-independent)

| Limiter | windowMs | max | Applied To | Demo Bypass |
|---------|----------|-----|-----------|-------------|
| `queueJoinLimiter` | 10s | 5 | POST /api/queue/join | Yes (`x-demo-bypass: true` + non-prod) |
| `queueStatusLimiter` | 2s | 3 | GET /api/queue/status | Yes |
| `queueInfoLimiter` | 5s | 10 | GET /api/queue/info | Yes |
| `authLimiter` | 15min | 10 | POST /api/auth/login + /signup | No |

No global rate limiter exists. Rate limiting is per-route only.

---

## POST /api/queue/join

**Auth:** None. Middleware: `queueJoinLimiter`.  
**Body:** `{ publicKey: string, userId: string }`

**Lua script (`queue-admission.lua`):**
```
KEYS[1] = flash:event:{publicKey}
KEYS[2] = flash:queue:{publicKey}
KEYS[3] = flash:result:{publicKey}
ARGV[1] = nowMs
ARGV[2] = userId

1.  HMGET KEYS[1]: status, stock, rateLimit, bucketTokens, bucketLastRefill, admitted, queueCap
2.  status nil          → return {-4, "EVENT_NOT_FOUND"}
3.  status == "PAUSED"  → return {-6, "EVENT_PAUSED"}
4.  status ~= "ACTIVE"  → return {-3, "EVENT_NOT_ACTIVE"}
5.  ZSCORE KEYS[2] userId exists  → return {-5, "ALREADY_JOINED"}
6.  HEXISTS KEYS[3] userId        → return {-5, "ALREADY_JOINED"}
7.  admitted >= queueCap          → return {-1, "SOLD_OUT"}
8.  Leaky bucket refill:
      elapsed  = nowMs - bucketLastRefill
      refilled = (elapsed / 1000) * rateLimit
      tokens   = math.min(rateLimit, bucketTokens + refilled)
9.  tokens >= 1 AND stock > 0  →  WON (instant):
      HSET KEYS[1]: bucketTokens=tokens-1, bucketLastRefill=nowMs,
                    stock=stock-1, admitted=admitted+1
      HSET KEYS[3]: userId = "WON"
      return {1, "WON"}
10. admitted < queueCap  →  QUEUED:
      ZADD KEYS[2] nowMs userId
      HINCRBY KEYS[1] admitted 1
      position = ZRANK KEYS[2] userId
      return {0, "QUEUED", position, rateLimit}
```

**Controller response map:**
| Code | HTTP | Body |
|------|------|------|
| `1` WON | 200 | `{ status:"WON", token:jwt }` — sign RS256 JWT with rsaPrivateKey |
| `0` QUEUED | 202 | `{ status:"QUEUED", position, estimatedWaitMs, pollUrl, pollIntervalMs:2000 }` |
| `-1` SOLD_OUT | 200 | `{ status:"SOLD_OUT" }` |
| `-3` NOT_ACTIVE | 400 | `{ error:"EVENT_NOT_ACTIVE" }` |
| `-4` NOT_FOUND | 404 | `{ error:"EVENT_NOT_FOUND" }` |
| `-5` ALREADY_JOINED | 200 | `{ status:"ALREADY_JOINED", pollUrl }` |
| `-6` PAUSED | 503 | `{ status:"PAUSED", message:"Sale temporarily paused", retryAfter:30 }` |

`estimatedWaitMs = Math.round(position * (1000 / rateLimit))`

`QueueAttempt.create()` is always fire-and-forget (`.catch()`-ed). Postgres latency must never block response.

---

## GET /api/queue/status

**Auth:** None. Middleware: `queueStatusLimiter`.  
**Query:** `pk`, `userId`  
**Zero Postgres queries. P99 target < 1ms.**

```
1. HGET flash:result:{pk} userId
2. "WON"     → GET flash:ticket:{pk}:{userId}
               JWT exists  → 200 { status:"WON", token:jwt }
               Missing/TTL → 200 { status:"WON", tokenExpired:true }
3. "SOLD_OUT" → 200 { status:"SOLD_OUT" }
4. null       → ZRANK flash:queue:{pk} userId
               rank exists → 200 { status:"QUEUED", position:rank+1, estimatedWaitMs }
               null        → 404 { error:"NOT_FOUND" }
```

---

## GET /api/queue/info

**Auth:** None. Middleware: `queueInfoLimiter`.  
**Query:** `pk`  
**Pure Redis, zero Postgres.**

```
HMGET flash:event:{pk}: status, stock, rateLimit, admitted, queueCap
ZCARD flash:queue:{pk}: queueLength

Response 200:
{
  status: string,
  stock: number,
  queueLength: number,
  rateLimit: number,
  estimatedWaitMs: number,   // ceil(queueLength / rateLimit * 1000)
  queueCap: number,
  admitted: number
}
```

---

## Server-Side Drain Loop (`drain.service.ts`)

One `setInterval` per active event. Interval: **1000ms**. Batch size: **rateLimit** (the event's rateLimit field).

```
Tick:
1. ZCARD flash:queue:{pk}  →  skip if 0
2. ZPOPMIN flash:queue:{pk} COUNT rateLimit  (atomic)
3. For each popped userId:
   drain-process.lua:
     KEYS[1] = flash:event:{pk}
     KEYS[2] = flash:result:{pk}
     ARGV[1] = userId
     stock > 0: HINCRBY stock -1, HSET KEYS[2] userId "WON"  → return {1,"WON"}
     stock ≤ 0: HSET KEYS[2] userId "SOLD_OUT"               → return {-1,"SOLD_OUT"}

   WON:      sign JWT (rsaPrivateKey from cache)
             SET flash:ticket:{pk}:{userId} jwt EX 900
   SOLD_OUT (stock=0): drainRemainingAsSoldOut()
             ZPOPMIN all remaining → bulk HSET "SOLD_OUT" in result hash

4. Fire-and-forget QueueAttempt.create() per user
```

**Lifecycle:**
- `startDrain(pk, rateLimit)` — called by `activateEvent()` and `resumeEvent()`
- `stopDrain(pk)` — called by `endEvent()` and `pauseEvent()`
- `initDrains()` — on server startup, queries Postgres for all ACTIVE events
- `getActiveDrains()` — returns `{ count, events: string[] }` for health endpoint

**Graceful shutdown:** `SIGTERM`/`SIGINT` → stop all drains → close Redis → disconnect Prisma → exit.

---

## GET /api/.well-known/jwks/:eventPublicKey

**Auth:** None (public — clients verify tokens offline with this).

```
1. Fetch rsaPublicKey PEM from event cache (Postgres fallback)
2. createPublicKey({ key: pem, format: 'pem' }).export({ format: 'jwk' })
3. Return:
{
  keys: [{
    kty: "RSA",
    use: "sig",
    alg: "RS256",
    kid: eventPublicKey,
    n: "...",    // base64url modulus
    e: "AQAB"   // base64url exponent
  }]
}
```

---

## POST /api/queue/verify

**Auth:** None. No rate limiter. Called by client backend only.  
**Headers:** `x-public-key: {eventPublicKey}`  
**Body:** `{ token: string }`

```
1. Decode token without verification → extract pk, eid from payload
2. pk must match x-public-key header → 400 if mismatch
3. Fetch rsaPublicKey from event cache (Postgres fallback)
4. Verify RS256 signature with fast-jwt createVerifier
5. prisma.usedJti.create({ jti, saleEventId: eid, expiresAt })
   P2002 (unique violation) → 409 "Token already used"
   Two concurrent calls race INSERT — loser gets 409. No lock needed (PK is the lock).
6. If event.mode === "TEST" → return 200 { valid:true, userId, eventId, jti, test:true }
   Else                     → return 200 { valid:true, userId, eventId, jti }
```

---

## POST /api/queue/release

**Auth:** `requireEventOwnership` middleware.  
**Headers:** `x-public-key`, `x-signature: sha256={hex}`, `x-timestamp: {ms}`  
**Body:** `{ jti: string, reason: "EXPIRED"|"CANCELLED"|"PAYMENT_FAILED" }`

**HMAC construction (client replicates exactly):**
```ts
const body      = JSON.stringify({ jti, reason });
const timestamp = Date.now().toString();
const message   = `${timestamp}.${body}`;
const signature = createHmac('sha256', signingSecret).update(message).digest('hex');
// Headers: x-signature: sha256=${signature}, x-timestamp: ${timestamp}
```

**Engine verification:**
```
1. x-timestamp not older than 5 minutes                → 401 (replay prevention)
2. Recompute HMAC, timingSafeEqual compare              → 401 if mismatch
3. jti exists in QueueAttempt with result "WON"        → 404 if not found
4. jti not already in TicketRelease                    → 409 if duplicate
5. redis.hincrby(flash:event:{pk}, "stock", 1)         → atomic +1
6. ZCARD flash:queue:{pk} > 0 + drain not running      → restart drain
7. prisma.ticketRelease.create(...)                    → AWAITED (duplicate guard)
8. Fire-and-forget QueueAttempt { result:"RELEASED" }  → audit trail
9. fireWebhook if event.webhookUrl                     → fire-and-forget
10. return 200 { released:true, stockRestored:1 }
```

---

## Webhook Dispatcher (`webhook.service.ts`)

**Triggered by:** `activateEvent`, `endEvent`, `pauseEvent`, `resumeEvent`, `releaseTicket`  
**Pattern:** Fire-and-forget wrapper `fireWebhook(url, saleEventId, payload).catch(...)` — webhook failure never affects response.

**Retry:** Up to 3 attempts. Delays: 0ms → 2000ms → 10000ms. 5-second timeout per attempt (AbortController). Each attempt logged to `WebhookLog`.

**Payload shape:**
```ts
{
  event: "activated"|"ended"|"paused"|"resumed"|"stock_released",
  eventId: string,
  publicKey: string,
  timestamp: string,          // ISO 8601
  // stock_released only:
  jti?: string,
  reason?: string,
}
```

---

## Purchase JWT Design

```ts
// RS256, per-event rsaPrivateKey, fast-jwt createSigner per-event (not module-level)
{
  jti: uuidv4(),      // PK in UsedJti — double-spend shield
  sub: userId,        // opaque user ID from client
  pk:  publicKey,     // which event
  eid: eventId,       // SaleEvent.id for audit
  // exp: now + 15 minutes (15 * 60 * 1000 ms — fast-jwt takes ms)
}
```

---

## Auth JWT Design

```ts
// HS256, global AUTH_JWT_SECRET, 7-day expiry
{
  sub:   client.id,
  email: client.email,
  role:  client.role,   // "CLIENT" | "SUPER_ADMIN" — MUST be present for frontend routing
}
```

---

## Admin CRUD Routes (behind `requireAdminAuth`)

| Method | Route | Role | Notes |
|--------|-------|------|-------|
| GET | /api/admin/overview | CLIENT | Own metrics: totalEvents, totalUsersProcessed, avgConversion |
| GET | /api/admin/events | CLIENT/SA | CLIENT sees own. SA sees all + client email. Active events include `queueDepth` (live ZCARD) + `liveStock` (Redis HGET) |
| POST | /api/admin/events | CLIENT | Generates RSA keypair + signingSecret. Computes queueCap. Accepts `mode: "LIVE"\|"TEST"` |
| GET | /api/admin/events/:id | CLIENT/SA | Ownership check for CLIENT. Returns `integrationSnippet`. Never returns `rsaPrivateKey` |
| PUT | /api/admin/events/:id/activate | CLIENT/SA | Postgres→Redis→cache. Starts drain. Sets activatedAt. TEST mode: schedules 5-min stock reset via setTimeout |
| PUT | /api/admin/events/:id/end | CLIENT/SA | stopDrain → Postgres ENDED → Redis 48h TTL → evictCache. Cleans sorted set + result hash |
| POST | /api/admin/events/:id/duplicate | CLIENT/SA | Fresh keypair + signingSecret. Accepts name/stockCount/rateLimit overrides. Always mode:"LIVE", status:"PENDING" |
| GET | /api/admin/events/:id/stats | CLIENT/SA | Live Redis data + Postgres aggregates |
| GET | /api/admin/events/:id/timeline | CLIENT/SA | Bucketed QueueAttempt aggregation (raw SQL, bucketSeconds param, default 10) |
| GET | /api/admin/events/:id/webhooks | CLIENT/SA | Last 50 WebhookLog entries, desc |
| PUT | /api/admin/events/:id/pause | SA only | PAUSED. stopDrain. Preserves sorted set |
| PUT | /api/admin/events/:id/resume | SA only | ACTIVE. startDrain. Ensures cache warm |
| PUT | /api/admin/events/:id/rotate-secret | CLIENT/SA | New signingSecret. Updates Postgres + cache if ACTIVE. Returns new secret |
| GET | /api/superadmin/clients | SA only | All clients + event counts + totalUsersProcessed |
| PUT | /api/superadmin/clients/:id/suspend | SA only | suspended=true. Force-ends all active events. Evicts caches |
| PUT | /api/superadmin/clients/:id/unsuspend | SA only | suspended=false |
| GET | /api/superadmin/overview | SA only | Platform-wide stats |
| GET | /api/superadmin/system/health | SA only | Redis info, Postgres pool, Node process, drain state |

---

## Middleware Stack

| Middleware | Applied To |
|-----------|-----------|
| `cors` | All routes. `CORS_ORIGINS` env var (comma-separated). Allows `x-demo-bypass` header |
| `requireAuth` | All `/api/admin/*` and `/api/superadmin/*` |
| `requireRole("SUPER_ADMIN")` | Superadmin-only routes |
| `requireAdminAuth` | Admin routes — Bearer JWT OR `x-admin-secret` header |
| `requireEventOwnership` | POST `/api/queue/release` only |
| `queueJoinLimiter` | POST `/api/queue/join` |
| `queueStatusLimiter` | GET `/api/queue/status` |
| `queueInfoLimiter` | GET `/api/queue/info` |
| `authLimiter` | POST `/api/auth/login` + `/api/auth/signup` |

---

# 5. Redis Key Space

| Key | Type | TTL | Contents |
|-----|------|-----|----------|
| `flash:event:{pk}` | Hash | 48h | status, stock, rateLimit, bucketTokens, bucketLastRefill, eventId, admitted, queueCap |
| `flash:queue:{pk}` | Sorted Set | 48h | userId → arrival timestamp ms. FIFO. |
| `flash:result:{pk}` | Hash | 48h | userId → "WON" or "SOLD_OUT" |
| `flash:ticket:{pk}:{userId}` | String | 900s | Signed RS256 JWT. One per winner. |

`queueCap = stockCount × oversubscriptionMultiplier` — computed at event creation, stored in Redis hash.

---

# 6. Environment Variables

| Var | Required | Notes |
|-----|----------|-------|
| `DATABASE_URL` | Always | Prisma connection string |
| `REDIS_URL` | Always | Upstash connection string |
| `AUTH_JWT_SECRET` | Always | HS256 dashboard tokens. Change = all sessions invalidated |
| `CORS_ORIGINS` | Production | Comma-separated allowed origins. `*` if unset (dev only) |
| `PORT` | Optional | Default 3000 |
| `API_URL` | Optional | Used in integrationSnippet codegen |
| `ADMIN_SECRET` | **Remove** | Legacy. Superseded by JWT auth. Delete from codebase |
| `SUPER_ADMIN_EMAIL` | Seed only | Safe to remove from prod after seeding |
| `SUPER_ADMIN_PASSWORD` | Seed only | Safe to remove from prod after seeding |

```bash
# saas-dashboard/.env.local
NEXT_PUBLIC_API_URL="http://localhost:3000"
```

---

# 7. SDK Packages

## @flashengine/browser (`packages/browser-sdk/`)

**Zero runtime deps. Native fetch. Targets ES2020.**  
Build: `tsup` → `dist/index.mjs`, `dist/index.cjs`, `dist/react.mjs`, `dist/react.cjs` + `.d.ts`

**Exports:**
- `.` → `FlashQueue` class
- `./react` → `useFlashQueue` hook (peer dep: react ≥17)

**FlashQueue API:**
```ts
const queue = new FlashQueue({
  publicKey: string,
  userId: string,
  apiUrl?: string,          // default: 'https://api.flashengine.dev'
  pollIntervalMs?: number,  // default: 2000
  maxPollRetries?: number,  // default: 3
  debug?: boolean,
});

queue.on('queued', ({ position, estimatedWaitMs }) => {})
queue.on('won', ({ token, expiresAt }) => {})
queue.on('sold_out', () => {})
queue.on('paused', ({ retryAfter }) => {})
queue.on('error', ({ code, message }) => {})
queue.on('position', ({ position, estimatedWaitMs }) => {})  // fires each poll
queue.on('ticket_expiring', ({ expiresAt, remainingMs }) => {})  // at expiresAt - 60s

queue.join()          // starts flow
queue.destroy()       // cleanup, idempotent
queue.getInfo()       // pre-join queue state
queue.getStatus()     // current QueueStatus
queue.getToken()      // JWT if won
```

**Polling behavior:**
- Jitter: ±500ms on every poll interval (thundering herd prevention)
- Visibility API: pauses polling when tab hidden, immediate poll on visible
- Exponential backoff on network errors (2s → 4s → 8s → 16s cap)
- `destroy()` clears all timers + aborts in-flight fetch via AbortController

## @flashengine/server (`packages/server-sdk/`)

**Zero runtime deps. Node built-in `crypto` only. Node ≥18.**  
Build: `tsup` → `dist/index.mjs`, `dist/index.cjs` + `.d.ts`

**FlashEngine API:**
```ts
const engine = new FlashEngine({
  publicKey: string,
  signingSecret: string,
  apiUrl?: string,              // default: 'https://api.flashengine.dev'
  rsaPublicKey?: string,        // PEM — for offline verification
  fetchJwks?: boolean,          // auto-fetch JWKS if no rsaPublicKey
  requestTimeoutMs?: number,    // default: 10000
});

// Verify token + double-spend check (calls POST /verify)
await engine.verifyToken(token)
// → { valid:true, userId, eventId, jti, test?:true }

// Release ticket with auto-computed HMAC (calls POST /release)
await engine.releaseTicket(jti, 'PAYMENT_FAILED')
// → { released:true, stockRestored:1 }

// Offline verification (no API call, no double-spend check)
await engine.verifyTokenOffline(token)
// → { valid:true, userId, eventId, jti }
// WARNING: use only for UX (show checkout page). Always call verifyToken before charging.
```

**Error class:**
```ts
class FlashEngineError extends Error {
  code: string;      // TOKEN_ALREADY_USED | INVALID_TOKEN | ALREADY_RELEASED | AUTH_FAILED | TIMEOUT
  statusCode: number;
}
```

HMAC construction in `hmac.ts` — `buildReleaseHeaders(publicKey, body, signingSecret)` handles timestamp, signing, and header construction internally. Clients never construct HMAC manually.

---

# 8. Current File Structure

```
apps/
├── engine-gateway/
│   ├── prisma/
│   │   ├── schema.prisma
│   │   ├── migrations/
│   │   └── seed.ts                            ← upserts SUPER_ADMIN, safe to re-run
│   ├── scripts/
│   │   └── create-admin.ts                    ← interactive CLI: npm run create-admin
│   └── src/
│       ├── server.ts                          ← Express app, cors, Redis connect, initDrains, graceful shutdown
│       ├── controllers/
│       │   ├── auth.controller.ts             ← signup, login, getMe
│       │   ├── admin.controller.ts            ← createEvent, activateEvent, endEvent, duplicateEvent,
│       │   │                                     listEvents, getEvent, getEventStats, getClientOverview,
│       │   │                                     pauseEvent, resumeEvent, getEventTimeline,
│       │   │                                     getEventWebhooks, rotateSecret
│       │   ├── queue.controller.ts            ← joinQueue, getQueueStatus, getQueueInfo, verifyToken
│       │   ├── release.controller.ts          ← releaseTicket
│       │   └── superadmin.controller.ts       ← listClients, suspendClient, unsuspendClient,
│       │                                         getPlatformOverview, getSystemHealth
│       ├── routes/
│       │   ├── auth.routes.ts
│       │   ├── admin.routes.ts
│       │   ├── queue.routes.ts
│       │   ├── release.routes.ts
│       │   ├── superadmin.routes.ts
│       │   ├── jwks.routes.ts
│       │   └── health.routes.ts
│       ├── middleware/
│       │   ├── require-auth.middleware.ts     ← requireAuth, requireRole()
│       │   ├── admin-auth.middleware.ts       ← requireAdminAuth (JWT or x-admin-secret)
│       │   ├── event-ownership.middleware.ts  ← requireEventOwnership (HMAC + release route)
│       │   └── rate-limit.middleware.ts       ← queueJoinLimiter, queueStatusLimiter,
│       │                                         queueInfoLimiter, authLimiter
│       │                                         (all with x-demo-bypass skip in non-prod)
│       ├── services/
│       │   ├── redis.service.ts               ← ioredis singleton, defineCommand registrations
│       │   ├── prisma.service.ts              ← PrismaClient singleton, getPoolStats()
│       │   ├── event-cache.service.ts         ← Map cache, getEventEntry, warmEventCache,
│       │   │                                     evictEventCache, getCacheStats
│       │   ├── drain.service.ts               ← startDrain, stopDrain, initDrains, getActiveDrains,
│       │   │                                     drainRemainingAsSoldOut
│       │   └── webhook.service.ts             ← fireWebhook, dispatchWebhook (3 retries + WebhookLog)
│       ├── lib/
│       │   └── auth.ts                        ← signAuthToken, verifyAuthToken (HS256)
│       ├── scripts/
│       │   ├── queue-admission.lua            ← hot path: guards + leaky bucket + ZADD
│       │   └── drain-process.lua              ← drain: atomic stock decrement + result write
│       └── types/
│           └── express.d.ts                   ← Express Locals: client, eventData
│
└── saas-dashboard/
    └── src/
        ├── app/
        │   ├── (auth)/
        │   │   ├── layout.tsx
        │   │   ├── login/page.tsx
        │   │   └── signup/page.tsx
        │   ├── dashboard/                     ← CLIENT role
        │   │   ├── layout.tsx
        │   │   ├── page.tsx
        │   │   ├── events/
        │   │   │   ├── new/page.tsx           ← mode toggle (LIVE/TEST), duplicate query param pre-fill
        │   │   │   └── [id]/page.tsx          ← timeline chart, webhook logs, key rotation, test badge
        │   │   ├── docs/
        │   │   │   ├── layout.tsx             ← docs sidebar nav
        │   │   │   ├── page.tsx               ← docs index
        │   │   │   ├── quick-start/page.tsx
        │   │   │   ├── browser-sdk/page.tsx
        │   │   │   ├── server-sdk/page.tsx
        │   │   │   ├── api-reference/page.tsx
        │   │   │   ├── security/page.tsx
        │   │   │   ├── webhooks/page.tsx
        │   │   │   ├── troubleshooting/page.tsx
        │   │   │   └── architecture/page.tsx
        │   │   └── settings/page.tsx
        │   ├── admin/                         ← SUPER_ADMIN role
        │   │   ├── layout.tsx
        │   │   ├── page.tsx
        │   │   ├── live/page.tsx              ← war room: real-time grid of active events
        │   │   ├── clients/page.tsx
        │   │   ├── events/
        │   │   │   ├── page.tsx
        │   │   │   └── [id]/page.tsx
        │   │   ├── system/page.tsx
        │   │   └── settings/page.tsx
        │   ├── demo/page.tsx                  ← public traffic simulator, x-demo-bypass header
        │   └── suspended/page.tsx
        ├── components/
        │   ├── ui/
        │   │   ├── button.tsx
        │   │   ├── input.tsx
        │   │   ├── card.tsx
        │   │   ├── badge.tsx
        │   │   ├── modal.tsx
        │   │   ├── spinner.tsx
        │   │   ├── empty-state.tsx
        │   │   ├── stat-card.tsx
        │   │   ├── copyable-field.tsx
        │   │   ├── data-table.tsx
        │   │   ├── error-banner.tsx
        │   │   └── toast.tsx
        │   ├── layout/
        │   │   ├── sidebar.tsx
        │   │   ├── admin-sidebar.tsx
        │   │   └── page-header.tsx
        │   └── events/
        │       ├── event-stats.tsx
        │       ├── event-timeline.tsx
        │       ├── event-keys.tsx
        │       └── event-funnel.tsx
        ├── lib/
        │   ├── api.ts                         ← typed fetch wrapper, auto Bearer token
        │   ├── auth-context.tsx               ← user state, login/logout, role-aware redirect
        │   └── utils.ts                       ← relativeTime(), cn()
        └── middleware.ts                      ← edge: protect /dashboard and /admin routes

packages/
├── browser-sdk/
│   ├── src/
│   │   ├── index.ts                           ← FlashQueue class + all type exports
│   │   ├── types.ts                           ← QueueStatus, FlashQueueConfig, all event types
│   │   ├── transport.ts                       ← fetch wrapper, AbortController, jitter, backoff
│   │   └── react.ts                           ← useFlashQueue hook
│   ├── tsup.config.ts
│   ├── tsconfig.json
│   ├── package.json                           ← name: @flashengine/browser
│   └── README.md
└── server-sdk/
    ├── src/
    │   ├── index.ts                           ← FlashEngine class, FlashEngineError, clearJwksCache
    │   ├── types.ts                           ← FlashEngineConfig, VerifyResult, ReleaseResult
    │   ├── hmac.ts                            ← buildReleaseHeaders, signRequest
    │   └── jwks.ts                            ← fetchPublicKeyPem, verifyRS256, clearJwksCache
    ├── tsup.config.ts
    ├── tsconfig.json
    ├── package.json                           ← name: @flashengine/server
    └── README.md
```

---

# 9. Key Architectural Decisions

| Decision | Reason |
|----------|--------|
| Lua scripts for admission | Atomicity — TOCTOU race impossible. Single Redis thread. EVALSHA cached after first call. |
| Leaky bucket over token bucket | Fixed output rate regardless of burst. Protects CLIENT's payment DB, not this engine. |
| Sorted set (not list) for queue | Score = arrival ms = strict FIFO. ZRANK = O(log n) position. ZPOPMIN is atomic. |
| RS256 over HS256 for purchase tokens | Client verifies with public key — never needs private key. Compromised client server can't forge tokens. |
| Per-event RSA keypairs | One event compromised → zero effect on others. |
| In-memory rate limiters | Survive Redis failure. On single server, in-memory is sufficient. |
| Fire-and-forget QueueAttempt | Postgres latency must never block HTTP response. |
| No RabbitMQ/Kafka | Flash sales run minutes. Sub-ms Redis Lua feedback is the product. Async brokers add latency + operational cost. |
| Single-server drain loop | Simpler. Multi-pod would multiply drain rate (3 pods × 500/s = 1500/s to client DB). Fix: leader election via Redis lock. Not implemented — acknowledged trade-off. |

**Known flaws (acknowledged):**
- Redis death mid-sale: queue sorted set lost. Mitigation: Upstash with replication. Recovery: reconcile from Postgres QueueAttempt.
- Drain rate multiplication on horizontal scale: fix = Redis leader election lock on drain loop.
- Fire-and-forget audit logs: `.catch()` logs failures. Enhancement: batch writes with `createMany` on 1s accumulation.s
