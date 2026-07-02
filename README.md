# Flash Engine

B2B queue infrastructure that protects e-commerce backends from crashes during high-concurrency flash sales. When thousands of users hit buy at the same millisecond, Flash Engine acts as a cryptographic bouncer — only letting through what your database can handle.

---

## The Problem

Standard architectures fail under flash sale traffic because:

- **Connection pool exhaustion** — Postgres has ~20 connections. 10,000 concurrent users destroy it instantly.
- **TOCTOU race conditions** — Two users read `stock = 1`, both pass the check, both decrement. Stock goes negative. You've oversold.
- **Database lock contention** — Concurrent `UPDATE` statements queue up, latency spikes, server crashes.

---

## The Solution

A two-layer defense:

1. **Redis Lua Bouncer** — An atomic Lua script runs entirely inside Redis (single thread, no network round-trips). It checks stock, applies a leaky bucket rate limit, and decrements — all in one microsecond. Losers are rejected before touching Node.js or Postgres.

2. **RS256 Cryptographic Tickets** — Winners receive a signed JWT (15-minute expiry, unique `jti`). The client's backend verifies the signature locally and INSERTs the `jti` as a primary key — the database constraint itself prevents double-spend. No distributed lock needed.

---

## Demo Videos

**1. Platform Overview**
[clientview.webm](https://github.com/user-attachments/assets/1097eabd-892a-420f-8b25-ab4eda686e49)
[admin-overview.webm](https://github.com/user-attachments/assets/8bd7e2d7-d6b5-4368-aa81-ea8d02c09692)
[detailedevent.webm](https://github.com/user-attachments/assets/cdde90db-b96a-4b67-aab6-c6df4f97a29c)
Shows the SaaS dashboard (super admin creating events, generating API keys) and the client-facing view.

**2. Traffic Simulator — Queue Visualisation**
[queuedemo.webm](https://github.com/user-attachments/assets/f1084edd-b52b-4867-b73e-f6ce23f1702e)
Small-scale demo showing the queue in action with live visualisation of users joining, winning, and being rate-limited.

**3. Demo Storefront — Integration in Action**
[buyanddoubleprevent.webm](https://github.com/user-attachments/assets/1c8a4bff-bcc0-4e9f-bcea-635f121edc46)
[paymentfailure.webm](https://github.com/user-attachments/assets/265d3a52-a8fc-4c87-84ba-6e5da5c5873d)
End-to-end flow in a real store: user joins queue → receives ticket → checkout verifies token → simulate payment failure → stock released back to pool.

---

## Load Test Results

Tests run with [k6](https://k6.io/) on a single AMD Ryzen 5 machine. Server clustered with `pm2 start src/server.ts -i max`. File descriptors raised to 65,535.

### Phase 1 — Bouncer (Deflection Test)

> Records not available

| Config | Result |
|---|---|
| 2,000 concurrent virtual users | ✅ Zero database crashes |
| 800 items in stock | Sold out in seconds |
| Requests deflected | 57,000+ in 60 seconds |
| Rejection rate | ~1,000/sec |
| Postgres queries during deflection | **0** |

The Redis Lua script rejected excess traffic at O(1) without ever touching Node.js heavy processing or the database.

### Phase 2 — Deep Stock (Sustained Throughput Test)

<img width="1770" height="781" alt="stresstestmetric2" src="https://github.com/user-attachments/assets/962ac752-a6c2-454c-89de-06f7846b8298" />
<img width="1764" height="791" alt="stresstestmtrics1" src="https://github.com/user-attachments/assets/77cd9079-ec8e-4f9d-bbbc-daaf003e2f21" />

| Config | Result |
|---|---|
| 1,000 concurrent virtual users | ✅ Stable |
| Stock | 50,000 items (effectively unlimited) |
| Total requests served | 62,000+ in under 2 minutes |
| HTTP throughput | ~600 req/sec |
| **Verified cryptographic checkouts** | **~100 tx/sec** |
| P95 checkout latency | **265ms** |

Each "checkout" includes RS256 JWT verification + Postgres `INSERT` with unique constraint check. 100 of these per second, sustained, on a single local machine.

> **Note on the load test video:** Screen recording was attempted but killed during the test — the recording process competed for CPU cycles with the cryptography workload (RS256 is CPU-bound), causing P95 latency to spike to 8s and a 40% failure rate. Once the recorder was killed, the system stabilised to the numbers above. The screenshot captures the final stable run.

---

## Architecture

```
Client Frontend
      │
      │  POST /api/queue/join (x-public-key header)
      ▼
Engine Gateway (Express)
      │
      ├─► Redis Lua Script (atomic)
      │     ├── Check event status
      │     ├── Leaky bucket rate limit
      │     └── Decrement stock
      │
      │  [if WON]
      ├─► Node Cache → sign RS256 JWT (jti = UUID)
      │
      └─► Response: { token, expiresIn: 900 }

Client Backend
      │
      │  POST /api/queue/verify (token + x-public-key)
      ▼
Engine Gateway
      ├── Verify RS256 signature
      └── INSERT INTO UsedJti (jti PRIMARY KEY)
            ├── Success → 200 verified
            └── P2002 duplicate → 409 token already used
```

**Key invariants:**
- `secretKey` / `rsaPrivateKey` never touches Redis — lives only in Postgres + in-process Node cache
- Audit logs are fire-and-forget — never block the hot path response
- P99 target on `/api/queue/join`: under 30ms

---

## Repos

| Repo | Stack | Purpose |
|---|---|---|
| `engine-gateway` | Express, Redis, Postgres, Prisma | Queue brain. This repo. |
| `saas-dashboard` | Next.js | Client signup, event management, key generation |
| `browser-sdk/server-sdk` | TypeScript, NPM | Browser-side fetch wrapper for clients |

---

## Stack

```
Express       → HTTP server
ioredis       → Redis client (single persistent TCP connection)
fast-jwt      → RS256 JWT signing/verification (factory pattern)
Prisma        → ORM with @prisma/adapter-pg
PostgreSQL    → Source of truth, double-spend shield
Redis         → Queue state, leaky bucket, stock counter
```

---

## How Clients Integrate

**1. Get keys from the dashboard**

After creating a flash sale event, the dashboard gives you:
- `publicKey` — safe to use in frontend code
- `signingSecret` — server-side only, for release route HMAC
- `rsaPublicKey` — for local JWT verification (or fetch from JWKS endpoint)

**2. Frontend — join the queue**

```ts
const res = await fetch('https://your-engine.railway.app/api/queue/join', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-public-key': 'pk_live_...',
  },
  body: JSON.stringify({ userId: currentUser.id }),
});

const { result, token } = await res.json();
// result: 'WON' | 'SOLD_OUT' | 'RATE_LIMITED'
// token: RS256 JWT, valid 15 minutes
```

**3. Backend — verify and checkout**

```ts
const res = await fetch('https://your-engine.railway.app/api/queue/verify', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-public-key': 'pk_live_...',
  },
  body: JSON.stringify({ token }),
});
// 200 → proceed to payment
// 409 → token already used (double-spend blocked)
// 401 → expired or invalid
```

**4. Backend — release on payment failure**

```ts
const body      = JSON.stringify({ jti, reason: 'PAYMENT_FAILED' });
const timestamp = Date.now().toString();
const sig       = crypto.createHmac('sha256', signingSecret)
                        .update(`${timestamp}.${body}`)
                        .digest('hex');

await fetch('https://your-engine.railway.app/api/queue/release', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-public-key':  'pk_live_...',
    'x-signature':   `sha256=${sig}`,
    'x-timestamp':   timestamp,
  },
  body,
});
// Stock returns to Redis pool. Next user in line can win.
```

---

## API Reference

| Method | Route | Auth | Description |
|---|---|---|---|
| `POST` | `/api/queue/join` | Public key header | Join the queue |
| `POST` | `/api/queue/verify` | Public key header | Consume a winning ticket |
| `POST` | `/api/queue/release` | HMAC signature | Return stock on failure |
| `POST` | `/api/admin/events` | Admin secret | Create a flash sale event |
| `PUT` | `/api/admin/events/:id/activate` | Admin secret | Open the queue |
| `PUT` | `/api/admin/events/:id/end` | Admin secret | Close the queue |
| `GET` | `/api/.well-known/jwks/:publicKey` | None | Fetch RSA public key |
| `GET` | `/health` | None | Full dependency check |
| `GET` | `/health/live` | None | Process alive check |
| `GET` | `/health/ready` | None | Dependencies ready check |

---

## Environment Variables

```env
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
ADMIN_SECRET=your-dashboard-to-engine-secret
ENGINE_URL=https://your-engine.railway.app
PORT=4000
```
