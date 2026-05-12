# Flash Engine — Integrate SDKs into testing/ Demo Site

> Feed this to Claude Code as a single prompt. It reads the existing demo-client and demo-server code, then rewrites the integration layer to use the actual FlashEngine SDKs via local path imports — no npm publishing required.

---

## Context

The monorepo has this structure:
```
/
├── apps/
│   ├── engine-gateway/      → The actual engine (Express + Redis + Postgres)
│   └── saas-dashboard/      → Dashboard frontend (Next.js)
├── packages/
│   ├── browser-sdk/         → @flashengine/browser source (built with tsup)
│   └── server-sdk/          → @flashengine/server source (built with tsup)
└── testing/
    ├── demo-client/         → Storefront frontend (existing code — READ FIRST)
    └── demo-server/         → Storefront backend (existing code — READ FIRST)
```

The `testing/` folder contains a complete flash sale demo website. It currently makes direct fetch calls to the engine. The goal is to replace those with proper SDK usage.

We do NOT publish to npm. We use local path imports so the SDK source is consumed directly.

---

## Step 1 — Build the SDKs

Before touching demo-client or demo-server, build both SDK packages:

```bash
cd packages/browser-sdk && npm install && npm run build
cd packages/server-sdk && npm install && npm run build
```

Verify that `packages/browser-sdk/dist/` and `packages/server-sdk/dist/` both exist after this.

---

## Step 2 — Read Existing Code First

**CRITICAL: Read all the existing files before writing a single line.**

```bash
# See what demo-client and demo-server actually contain
find testing/ -type f | sort

# Read them all
cat testing/demo-server/package.json
cat testing/demo-client/package.json
```

Then read every source file in both. Understand:
- What framework/library is used (Express? Fastify? Next.js? Vite? Vanilla React?)
- What routes exist in demo-server
- What pages/components exist in demo-client
- How they currently call the engine (raw fetch? existing SDK?)
- What env vars they use

Only after reading everything should you proceed.

---

## Step 3 — Wire demo-server to @flashengine/server

### 3a. Add local path dependency to demo-server/package.json

Add to `dependencies`:
```json
"@flashengine/server": "file:../../packages/server-sdk"
```

Then run: `cd testing/demo-server && npm install`

### 3b. Replace raw fetch/crypto with FlashEngine SDK

The server-sdk exports:
```ts
import { FlashEngine, FlashEngineError } from '@flashengine/server';

const engine = new FlashEngine({
  publicKey: process.env.EVENT_PUBLIC_KEY!,
  signingSecret: process.env.EVENT_SIGNING_SECRET!,
  apiUrl: process.env.ENGINE_API_URL ?? 'http://localhost:3000',
});
```

**Available methods:**
```ts
// Verify a purchase JWT — calls POST /api/queue/verify
// Handles: RS256 verification + double-spend check (UsedJti PK constraint)
// Returns: { valid: true, userId, eventId, jti, test?: boolean }
// Throws FlashEngineError with .code:
//   'TOKEN_ALREADY_USED' (409) — double-spend attempt
//   'INVALID_TOKEN' (400)     — bad signature or expired
//   'AUTH_FAILED' (401)       — wrong publicKey
//   'TIMEOUT'                 — engine didn't respond
//   'NETWORK_ERROR'           — connection refused
const result = await engine.verifyToken(token);

// Release a ticket back to the pool — calls POST /api/queue/release
// Handles: HMAC construction internally (timestamp + body + signingSecret)
// reason: 'EXPIRED' | 'CANCELLED' | 'PAYMENT_FAILED'
// Returns: { released: true, stockRestored: 1 }
await engine.releaseTicket(jti, 'PAYMENT_FAILED');

// Offline verify — verifies RS256 signature locally (no API call)
// Does NOT insert UsedJti — does NOT prevent double-spend
// Use to quickly render the checkout page, then call verifyToken before charging
const payload = await engine.verifyTokenOffline(token);
// Returns: { userId, pk, eid, jti }
```

**What to replace in demo-server:**

Find every place that:
1. Manually constructs HMAC (crypto.createHmac, timestamp, message building, hex digest) → replace with `engine.releaseTicket(jti, reason)`
2. Calls `fetch(.../api/queue/verify, ...)` with x-public-key header → replace with `engine.verifyToken(token)`
3. Catches 409 from verify and returns "already used" → replace with catching `FlashEngineError` where `err.code === 'TOKEN_ALREADY_USED'`

**Error handling pattern:**
```ts
import { FlashEngine, FlashEngineError } from '@flashengine/server';

try {
  const result = await engine.verifyToken(token);
  // result.valid is always true here — if invalid, it throws
  res.json({ success: true, userId: result.userId, jti: result.jti });
} catch (err) {
  if (err instanceof FlashEngineError) {
    if (err.code === 'TOKEN_ALREADY_USED') {
      return res.status(409).json({ error: 'TOKEN_ALREADY_USED', message: err.message });
    }
    if (err.code === 'INVALID_TOKEN') {
      return res.status(400).json({ error: 'INVALID_TOKEN', message: err.message });
    }
  }
  res.status(500).json({ error: 'INTERNAL_ERROR' });
}
```

Keep all existing routes, middleware, logging, and response shapes. Only replace the integration internals.

---

## Step 4 — Wire demo-client to @flashengine/browser

### 4a. Add local path dependency to demo-client/package.json

Add to `dependencies`:
```json
"@flashengine/browser": "file:../../packages/browser-sdk"
```

Then run: `cd testing/demo-client && npm install`

### 4b. Replace raw fetch queue calls with FlashQueue SDK

The browser-sdk exports (main entry point):
```ts
import { FlashQueue } from '@flashengine/browser';

const queue = new FlashQueue({
  publicKey: string,          // REQUIRED: the event's publicKey
  userId: string,             // REQUIRED: opaque user identifier
  apiUrl?: string,            // optional, default: 'https://api.flashengine.dev'
  pollIntervalMs?: number,    // default: 2000ms
  maxPollRetries?: number,    // default: 3
  debug?: boolean,            // logs to console if true
});
```

**Events (EventEmitter-style, use queue.on(event, handler)):**
```ts
queue.on('queued', ({ position, estimatedWaitMs }) => {
  // User entered the queue — show queue position UI
});

queue.on('position', ({ position, estimatedWaitMs }) => {
  // Fires on every poll while QUEUED — update position display
});

queue.on('won', ({ token, expiresAt }) => {
  // User won! token is the RS256 JWT to send to your server
  // expiresAt is a Date object (15 minutes from now)
  // Send token to your checkout endpoint
});

queue.on('sold_out', () => {
  // No stock left — show sold out state
});

queue.on('paused', ({ retryAfter }) => {
  // Event is temporarily paused — show retry message
});

queue.on('error', ({ code, message }) => {
  // Network error, rate limit, etc.
});

queue.on('ticket_expiring', ({ expiresAt, remainingMs }) => {
  // Fires 60 seconds before token expires
  // Show "Complete purchase in 1 minute" warning
});
```

**Methods:**
```ts
queue.join()      // Start the flow (join queue or get instant WON)
queue.destroy()   // Cleanup: stops polling, cancels in-flight requests
queue.getInfo()   // Pre-join: returns { status, queueLength, rateLimit, estimatedWaitMs }
queue.getStatus() // Current status string
queue.getToken()  // Returns JWT string if status is 'won', else null
```

**If demo-client uses React**, use the hook instead:
```ts
import { useFlashQueue } from '@flashengine/browser/react';

// OR if the package.json exports map doesn't have /react subpath yet, try:
import { useFlashQueue } from '@flashengine/browser';

const {
  status,           // 'idle' | 'joining' | 'queued' | 'won' | 'sold_out' | 'paused' | 'error'
  position,         // number | null
  estimatedWaitMs,  // number | null
  token,            // string | null (the JWT)
  error,            // { code, message } | null
  isTicketExpiring, // boolean
  join,             // () => void
  destroy,          // () => void
  getInfo,          // () => Promise<QueueInfo>
} = useFlashQueue({
  publicKey: 'clxyz...',
  userId: 'user_abc',
  apiUrl: 'http://localhost:3000',
  autoJoin: false,  // set true to join immediately on mount
  enabled: true,
});
```

**What to replace in demo-client:**

Find every place that:
1. Calls `fetch(.../api/queue/join, ...)` → replace with `new FlashQueue(...)` + `queue.join()`
2. Polls `fetch(.../api/queue/status, ...)` in a setInterval/setTimeout → delete — the SDK handles polling internally
3. Manages queue state manually (local state for position, status, token) → replace with SDK events or hook return values
4. Calls `fetch(.../api/queue/info, ...)` for pre-join info → replace with `queue.getInfo()`

Keep all existing UI, styling, and page structure. Only replace the data-fetching layer.

---

## Step 5 — Environment Variables

Ensure both apps have `.env.example` files that match what the SDK expects:

**testing/demo-server/.env.example:**
```bash
ENGINE_API_URL=http://localhost:3000
EVENT_PUBLIC_KEY=                    # from dashboard event detail page
EVENT_SIGNING_SECRET=                # from dashboard event detail page (Keys section)
PORT=4000
```

**testing/demo-client/.env.example (or .env.local if Next.js):**
```bash
# For Next.js, prefix with NEXT_PUBLIC_
# For Vite, prefix with VITE_
ENGINE_API_URL=http://localhost:3000        # or NEXT_PUBLIC_ / VITE_ prefix
DEMO_SERVER_URL=http://localhost:4000       # or NEXT_PUBLIC_ / VITE_ prefix
EVENT_PUBLIC_KEY=                          # or NEXT_PUBLIC_ / VITE_ prefix
```

Adjust the prefix based on what framework demo-client actually uses.

---

## Step 6 — Update testing/README.md

Create or update `testing/README.md`:

```markdown
# FlashEngine — Demo Site

A complete flash sale storefront demonstrating real FlashEngine integration.
Uses `@flashengine/browser` and `@flashengine/server` via local path imports.

## What This Shows

- Full queue flow: join → wait → win → checkout
- Token verification (RS256 JWT + double-spend protection)
- Ticket release (HMAC-authenticated, stock returned to pool)

## Setup

### 1. Build the SDKs (required first)
cd packages/browser-sdk && npm install && npm run build
cd packages/server-sdk && npm install && npm run build

### 2. Configure demo-server
cd testing/demo-server
cp .env.example .env
# Edit .env — set EVENT_PUBLIC_KEY and EVENT_SIGNING_SECRET
# (Get these from the dashboard event detail page after creating + activating an event)
npm install
npm run dev

### 3. Configure demo-client
cd testing/demo-client
cp .env.example .env
# Edit .env — set EVENT_PUBLIC_KEY and the server URLs
npm install
npm run dev

## What to Show Interviewers

1. Open the storefront in the browser
2. Click "Join Queue" — watch queue position update
3. When won: click "Checkout" — token is verified by demo-server calling engine
4. Try checkout AGAIN with same token → 409 double-spend prevention
5. Reset: join again → win → "Simulate Payment Failure" → stock released
6. Watch demo-server terminal: every verify/release logged
7. Check dashboard: stats update in real-time
```

---

## What NOT to Change

- Don't change the UI/design/styling of demo-client
- Don't change the route structure of demo-server  
- Don't change any functionality — only replace the data-fetching layer with SDK calls
- Don't add new features — this is a refactor to use the SDK, not a rewrite

## Verification

After the integration, confirm:
1. `cd testing/demo-server && npm run dev` starts without TypeScript errors
2. `cd testing/demo-client && npm run dev` starts without errors
3. The storefront loads and queue join works end-to-end
4. Verify route (through demo-server) works
5. Release route (through demo-server) works
