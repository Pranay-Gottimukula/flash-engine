# Flash Sale Engine — Project State Document
> Last updated: current session. Dense technical reference. No fluff.

---

## 1. What This Is

A **multi-tenant B2B SaaS platform** that protects e-commerce sites from database crashes and inventory overselling during high-traffic flash sales (10,000+ concurrent users). Clients sign up, create flash sale events, get API keys, and integrate via SDK. The engine sits between the end-user's browser and the client's payment backend — acting as an atomic, rate-limited queue.

---

## 2. Monorepo Structure

```
/
├── apps/
│   ├── engine-gateway/          → Express + Redis + Postgres. Deployed to Railway.
│   └── saas-dashboard/          → Next.js 14 App Router. Deployed to Vercel.
└── packages/
    ├── browser-sdk/             → @flashengine/browser (npm package, ESM/CJS/UMD)
    └── server-sdk/              → @flashengine/server (npm package, ESM/CJS)
```

---

## 3. Tech Stack

**engine-gateway:**
- Runtime: Node.js + TypeScript
- HTTP: Express
- Queue: Redis (ioredis) — atomic Lua scripts via `defineCommand` / EVALSHA
- Database: PostgreSQL via Prisma (`@prisma/adapter-pg`)
- Purchase JWTs: `fast-jwt`, RS256, per-event RSA keypairs (2048-bit)
- Auth JWTs: `fast-jwt`, HS256, global `AUTH_JWT_SECRET`
- Password hashing: bcrypt (rounds: 12)
- HMAC (release route): Node built-in `crypto`
- Redis provider: **Upstash free tier** (10,000 commands/day limit)

**saas-dashboard:**
- Next.js 14 App Router
- No component library — hand-rolled components
- Green accent dark theme

**packages/browser-sdk:**
- Zero runtime deps. Native `fetch`. Outputs: ESM (`.mjs`), CJS (`.cjs`), UMD, `.d.ts`
- Exports: `FlashQueue` class (main), `useFlashQueue` React hook (`/react` subpath)
- Build: `tsup`

**packages/server-sdk:**
- Zero runtime deps. Node built-in `crypto` only. Node >=18 required.
- Exports: `FlashEngine` class, `FlashEngineError`
- Build: `tsup`

---

## 4. Core Architecture Flow

```
Browser (SDK: @flashengine/browser)
  │
  ├─► GET /api/queue/info?pk=              → Redis only. Pre-join queue state.
  │
  ├─► POST /api/queue/join
  │     Body: { publicKey, userId }
  │     │
  │     └─ queue-admission.lua (atomic, single Redis thread):
  │         1. HMGET flash:event:{pk} — status, stock, rateLimit, bucketTokens,
  │                                     bucketLastRefill, admitted, queueCap
  │         2. Guard: nil → EVENT_NOT_FOUND, PAUSED → EVENT_PAUSED,
  │                   !ACTIVE → EVENT_NOT_ACTIVE
  │         3. Duplicate check: ZSCORE sorted set + HEXISTS result hash → ALREADY_JOINED
  │         4. admitted >= queueCap → SOLD_OUT (door closed, never enters queue)
  │         5. Leaky bucket refill:
  │              elapsed = nowMs - bucketLastRefill
  │              tokens  = min(rateLimit, bucketTokens + elapsed/1000 * rateLimit)
  │         6. tokens >= 1 AND stock > 0:
  │              HSET: bucketTokens-=1, stock-=1, admitted+=1
  │              HSET result hash: userId = "WON"
  │              return {1, "WON", rateLimit}
  │         7. admitted < queueCap:
  │              ZADD sorted set nowMs userId
  │              HINCRBY admitted +1
  │              position = ZRANK
  │              return {0, "QUEUED", position, rateLimit}
  │
  │     Controller response:
  │       WON    → sign RS256 JWT with rsaPrivateKey → 200 { status, token }
  │       QUEUED → 202 { status, position, estimatedWaitMs, pollUrl }
  │       SOLD_OUT → 200 { status }
  │
  ├─► GET /api/queue/status?pk=&userId=    → Redis only, P99 < 1ms
  │     1. HGET flash:result:{pk} userId
  │     2. "WON" → GET flash:ticket:{pk}:{userId} → return JWT (or tokenExpired)
  │     3. "SOLD_OUT" → return SOLD_OUT
  │     4. null → ZRANK → QUEUED with position + estimatedWaitMs, or NOT_FOUND
  │
  └─► [Server-side drain loop — drain.service.ts]
        setInterval every 1000ms per active event:
          1. ZCARD → skip if 0
          2. ZPOPMIN COUNT batchSize (= rateLimit)
          3. Per user: drain-process.lua →
               stock > 0: HINCRBY stock -1, HSET result "WON" → sign JWT →
                          SET flash:ticket:{pk}:{userId} jwt EX 900
               stock = 0: HSET result "SOLD_OUT" →
                          bulk SOLD_OUT remaining queue
          4. Fire-and-forget QueueAttempt.create() for audit

Client Backend (SDK: @flashengine/server)
  │
  ├─► POST /api/queue/verify
  │     Header: x-public-key
  │     Body: { token }
  │     → Verify RS256 sig → prisma.usedJti.create (PK constraint = double-spend shield)
  │     → 409 if already used. Race: two concurrent calls → loser gets 409. No lock needed.
  │
  └─► POST /api/queue/release
        Headers: x-public-key, x-signature: sha256={hex}, x-timestamp
        Body: { jti, reason: "EXPIRED"|"CANCELLED"|"PAYMENT_FAILED" }
        → HMAC verify (timingSafeEqual, 5-min replay window)
        → HINCRBY stock +1 (atomic)
        → prisma.ticketRelease.create (AWAITED — this is the duplicate guard)
        → Fire webhook if webhookUrl set
```

---

## 5. Database Schema (Prisma)

```prisma
model Client {
  id        String      @id @default(cuid())
  email     String      @unique
  password  String                           // bcrypt hash, rounds 12
  name      String?
  role      String      @default("CLIENT")   // "CLIENT" | "SUPER_ADMIN"
  suspended Boolean     @default(false)
  publicKey String      @unique              // client-level identifier
  createdAt DateTime    @default(now())
  events    SaleEvent[]
}

model SaleEvent {
  id                       String    @id @default(cuid())
  clientId                 String
  name                     String
  stockCount               Int
  rateLimit                Int       @default(50)
  oversubscriptionMultiplier Float   @default(1.5)
  status                   String    @default("PENDING")  // PENDING|ACTIVE|PAUSED|ENDED
  mode                     String    @default("LIVE")     // "LIVE" | "TEST"
  publicKey                String    @unique
  rsaPrivateKey            String    // PEM — signs JWTs, never leaves engine
  rsaPublicKey             String    // PEM — served via JWKS
  signingSecret            String    // HMAC secret for release route
  webhookUrl               String?
  activatedAt              DateTime?
  endedAt                  DateTime?
  createdAt                DateTime  @default(now())

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
  result      String   // WON|QUEUED|SOLD_OUT|RATE_LIMITED|RELEASED
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

---

## 6. Redis Key Space

| Key | Type | TTL | Contents |
|-----|------|-----|----------|
| `flash:event:{pk}` | Hash | 48h | status, stock, rateLimit, bucketTokens, bucketLastRefill, eventId, admitted, queueCap |
| `flash:queue:{pk}` | Sorted Set | 48h | userId → arrival timestamp (ms). FIFO by score. |
| `flash:result:{pk}` | Hash | 48h | userId → "WON" or "SOLD_OUT" |
| `flash:ticket:{pk}:{userId}` | String | 900s | Signed RS256 JWT. One key per winner. |

**queueCap** = `stockCount × oversubscriptionMultiplier`, computed at event creation, stored in `flash:event:{pk}`.

**Upstash budget reality:** Each full user lifecycle (join → poll × 2 → drain) ≈ 17 Redis commands. At 50 users = ~850 commands. Free tier = 10,000/day → ~11 full 50-user test runs per day max.

---

## 7. Cryptographic Key Map

| Key | Type | Lives In | Used By | Never In |
|-----|------|----------|---------|----------|
| `rsaPrivateKey` | 2048-bit RSA PEM | Postgres + Node Map cache | Engine — signs purchase JWTs | Redis, client |
| `rsaPublicKey` | 2048-bit RSA PEM | Postgres + Node cache + JWKS | Client backend — verifies JWTs | — |
| `signingSecret` | 32-byte hex | Postgres + Node cache | Engine verifies, client signs release requests | Redis |
| `publicKey` (event) | cuid | Postgres + Redis hash field | All Redis keys, all API calls | — |
| `AUTH_JWT_SECRET` | env var | Environment only | HS256 auth tokens (dashboard login) | DB, Redis |

**Node in-process cache** (`event-cache.service.ts`):
```ts
const cache = new Map<string, {
  rsaPrivateKey: string;
  rsaPublicKey:  string;
  signingSecret: string;
  eventId:       string;
  name:          string;
}>();
```
Warmed on `activateEvent()`, evicted on `endEvent()` / `suspendClient()`. Map hit = O(1). Postgres fallback on miss (ACTIVE events only).

---

## 8. Environment Variables

| Var | Required | Purpose | Safe to remove? |
|-----|----------|---------|----------------|
| `DATABASE_URL` | Always | Prisma connection | No |
| `REDIS_URL` | Always | Upstash connection | No |
| `AUTH_JWT_SECRET` | Always | HS256 dashboard login tokens | No |
| `ADMIN_SECRET` | No | Legacy header auth — superseded by JWT | **Yes — delete it** |
| `SUPER_ADMIN_EMAIL` | Seed only | Seed script input | After seeding |
| `SUPER_ADMIN_PASSWORD` | Seed only | Seed script input | After seeding |
| `PORT` | Optional | HTTP port, default 3000 | Optional |
| `API_URL` | Optional | Used in integrationSnippet codegen | Optional |
| `CORS_ORIGINS` | Production | Comma-separated allowed origins | No (in prod) |

---

## 9. Roles & Auth Flow

Two roles: `CLIENT` and `SUPER_ADMIN`. Stored as strings in `Client.role`.

- `POST /api/auth/signup` → creates CLIENT, returns HS256 JWT (7 days)
- `POST /api/auth/login` → validates bcrypt, returns JWT with `{ sub, email, role }`
- JWT payload **must** include `role` — frontend uses it for redirect logic
- Login → `role === "SUPER_ADMIN"` → redirect `/admin`, else `/dashboard`
- Super admin seeded via `npx prisma db seed` or `npm run create-admin` CLI script

Middleware chain for protected routes:
```
requireAuth → verifies Bearer JWT, attaches decoded client to res.locals.client
requireRole("SUPER_ADMIN") → checks res.locals.client.role === "SUPER_ADMIN"
requireAdminAuth → accepts either Bearer JWT OR x-admin-secret header (legacy)
requireEventOwnership → reads x-public-key, fetches event, verifies clientId
```

---

## 10. API Surface

**Public queue routes (no auth, rate limited in-memory):**
- `POST /api/queue/join` — 5 req/10s per IP
- `GET /api/queue/status` — 3 req/2s per IP
- `GET /api/queue/info` — 10 req/5s per IP
- `POST /api/queue/verify` — called by client backend
- `POST /api/queue/release` — HMAC authenticated
- `GET /api/.well-known/jwks/:pk` — serves JWK Set

**Admin routes (requireAdminAuth):**
- CRUD: events, activate, end, pause, resume, duplicate, rotate-secret
- Stats: `GET /api/admin/events/:id/stats`, `/timeline`, `/webhooks`
- Overview: `GET /api/admin/overview`

**Superadmin routes (requireAuth + requireRole("SUPER_ADMIN")):**
- `GET /api/superadmin/clients`
- `PUT /api/superadmin/clients/:id/suspend|unsuspend`
- `GET /api/superadmin/overview`
- `GET /api/superadmin/system/health`

---

## 11. Features Implemented

- ✅ Atomic queue admission (Lua script, leaky bucket, sorted set, queueCap)
- ✅ Server-side drain loop (setInterval, ZPOPMIN, per-event lifecycle)
- ✅ RS256 per-event keypairs, purchase JWT signing
- ✅ Double-spend shield (UsedJti PK constraint)
- ✅ HMAC release route (timing-safe, 5-min replay window)
- ✅ JWKS endpoint
- ✅ HS256 auth tokens, bcrypt passwords, role-based middleware
- ✅ In-process event cache (Map, warm/evict lifecycle)
- ✅ Webhook dispatcher (3 retries, exponential backoff, WebhookLog)
- ✅ Test mode (stock reset every 5 min, `test: true` in verify response)
- ✅ Secret rotation endpoint (`PUT /rotate-secret`)
- ✅ Timeline analytics endpoint (bucketed QueueAttempt aggregation)
- ✅ Queue info endpoint (`estimatedWaitMs` pre-join)
- ✅ Super admin: live monitoring, client management, system health
- ✅ `@flashengine/browser` SDK (FlashQueue class + useFlashQueue React hook)
- ✅ `@flashengine/server` SDK (FlashEngine class, HMAC, JWKS, offline verify)
- ✅ Dashboard docs section (8 pages: Quick Start, Browser SDK, Server SDK, API Reference, Security, Webhooks, Troubleshooting, Architecture)
- ✅ Demo simulator page (`/demo`, public, no auth)
- ✅ CORS middleware (`CORS_ORIGINS` env var)

---

## 12. Current Bug Being Worked On

**Problem:** Demo simulator at `/demo` shows incorrect results when testing the queue.

**Observed:** With 15 stock, 50 users, 5 rateLimit, 1.5x multiplier — only 5 users showed as WON and all others appeared to be rejected/rate-limited.

**Root cause (two issues):**

**Issue A — Simulator not polling QUEUED users.**
When `POST /join` returns `{ status: "QUEUED" }`, the simulator logs it and stops. It never starts the polling loop (`GET /api/queue/status`) for those users. So the 17 users who entered the queue (users 6–22) sit in Redis, get processed by the drain loop into WON, but the simulator never sees it — their dots stay yellow forever and are never counted as WON.

**Issue B — queueCap misunderstanding in UI.**
`queueCap = stockCount × oversubscriptionMultiplier = 15 × 1.5 = 22`.
Only 22 users are admitted total. Users 23–50 (28 users) get `SOLD_OUT` at the Lua script door check (step 4 above), before even reaching the leaky bucket. The simulator was labeling this as "rate limited" — it's not. "Door closed" = hit queueCap. "Drain rejected" = was queued but stock ran out before their turn. These are different outcomes.

**Expected behavior with those params:**
```
t=0:    Users 1–5    → WON instantly (leaky bucket tokens available)
        Users 6–22   → QUEUED (17 in sorted set, polling must start)
        Users 23–50  → SOLD_OUT immediately (queueCap = 22, door closed)

t+1s:   Drain fires → ZPOPMIN 5 → WON (stock: 15→10)
t+2s:   Drain fires → ZPOPMIN 5 → WON (stock: 10→5)
t+3s:   Drain fires → ZPOPMIN 5 → WON (stock: 5→0)
        Remaining 2 queued → SOLD_OUT (stock exhausted)

Final:  15 WON, 7 SOLD_OUT (2 drain-rejected + 5 door-closed that...
        actually: 28 door-closed, 2 drain-rejected)
        Correct final: 15 WON ✅, 28 door-closed ✅, 2 drain-rejected ✅
```

**Fix needed in `/demo/page.tsx`:**
1. On `QUEUED` response: immediately start polling loop with jitter (±300ms). Store timers in `useRef<Map<string, ReturnType<typeof setTimeout>>>`. Clear all on Stop/Reset.
2. Separate stat counters: `won`, `doorClosed` (SOLD_OUT at join), `drainRejected` (SOLD_OUT at poll), `queued` (live count in queue).
3. Fetch `/api/queue/info` before starting — display stock/rateLimit/queueCap to set expectations. Block start if event not ACTIVE.
4. Poll response handling: WON → resolve, stop polling. SOLD_OUT → resolve as drainRejected, stop polling. QUEUED → update position, keep polling.

**The engine is correct. Only the simulator UI needs to be fixed.**
