# Flash Engine — Demo Storefront & Full-Flow Prompts

> These build a real demo e-commerce storefront (demo-client + demo-server) that demonstrates the **complete** FlashEngine flow: queue → win → verify → checkout → release. Feed sequentially.
>
> The existing `/demo` page is the traffic simulator (dot grid, 50+ virtual users). These prompts build something different: a single-user storefront experience that shows verify and release working end-to-end.

---

## Prompt DEMO-STORE-1 — Demo Server (Client's Backend Simulator)

```
CONTEXT: Read the project context document first. This is a Flash Sale Engine — a B2B SaaS platform. The "demo-server" simulates what a CLIENT's backend would do: verify purchase JWTs and release tickets on payment failure.

Create the demo server at apps/demo/demo-server/. This is a tiny Express server that acts as a mock e-commerce backend.

## Structure:
apps/demo/demo-server/
├── src/
│   ├── server.ts
│   └── types.ts
├── package.json
├── tsconfig.json
└── .env.example

## Dependencies:
- express, cors, dotenv
- TypeScript + tsx (for dev)
- No SDK import — use raw fetch calls to the engine-gateway

## Environment variables (.env.example):
ENGINE_API_URL=http://localhost:3000       # engine-gateway URL
EVENT_PUBLIC_KEY=                          # publicKey of the test event
EVENT_SIGNING_SECRET=                      # signingSecret from event detail page
PORT=4000

## Routes:

### POST /api/checkout
Called by demo-client when user clicks "Complete Purchase".
Body: { token: string, userId: string }

Logic:
1. Call POST {ENGINE_API_URL}/api/queue/verify with:
   - Header: x-public-key: {EVENT_PUBLIC_KEY}
   - Body: { token }
2. If verify returns 200 { valid: true }:
   - Simulate payment processing (just a 1-2 second delay with setTimeout)
   - Return 200 { success: true, orderId: "ORD-" + random6digits, message: "Payment successful!" }
3. If verify returns 409 (token already used):
   - Return 409 { error: "TOKEN_ALREADY_USED", message: "This purchase token has already been redeemed." }
4. If verify returns 400/401 (invalid token):
   - Return 400 { error: "INVALID_TOKEN", message: "Invalid or expired token." }
5. On any other error: return 500 with the upstream error

### POST /api/checkout/fail
Called by demo-client when user clicks "Simulate Payment Failure".
Body: { jti: string, reason: "PAYMENT_FAILED" | "CANCELLED" }

Logic:
1. Construct HMAC exactly as documented:
   - const body = JSON.stringify({ jti, reason });
   - const timestamp = Date.now().toString();
   - const message = `${timestamp}.${body}`;
   - const signature = crypto.createHmac('sha256', EVENT_SIGNING_SECRET).update(message).digest('hex');
2. Call POST {ENGINE_API_URL}/api/queue/release with:
   - Header: x-public-key: {EVENT_PUBLIC_KEY}
   - Header: x-signature: sha256={signature}
   - Header: x-timestamp: {timestamp}
   - Body: { jti, reason }
3. Return the engine response to demo-client

### GET /api/health
Returns { status: "ok", engineUrl: ENGINE_API_URL, eventConfigured: !!EVENT_PUBLIC_KEY }

## CORS: Allow all origins (it's a demo).

## package.json scripts:
- "dev": "tsx watch src/server.ts"
- "build": "tsc"
- "start": "node dist/server.js"

## CRITICAL IMPLEMENTATION NOTES:
- The HMAC construction must match EXACTLY what the engine expects. The message format is `${timestamp}.${body}` where body is the JSON.stringify of the request body.
- crypto.createHmac is from Node's built-in crypto module, no external package needed.
- Add console.log for each step so the interviewer can see the verify/release flow in the terminal.
- Add colorful console output: green for success, red for failure, yellow for HMAC construction steps.
```

---

## Prompt DEMO-STORE-2 — Demo Client (Storefront Frontend)

```
IMPORTANT: Read /mnt/skills/public/frontend-design/SKILL.md before writing any code.

CONTEXT: This is the customer-facing demo storefront for the Flash Sale Engine. It shows what an e-commerce site looks like when integrated with FlashEngine. The demo-server (built in previous prompt) acts as the store's backend.

Create the demo client at apps/demo/demo-client/. This is a Next.js app (or plain React with Vite — your choice, pick whatever is simpler to run) that represents a fake sneaker store.

## Structure:
apps/demo/demo-client/
├── src/
│   ├── app/ (or pages/ if Vite)
│   ├── components/
│   └── lib/
├── package.json
├── .env.example
└── README.md

## Environment variables:
NEXT_PUBLIC_ENGINE_API_URL=http://localhost:3000   # engine-gateway (for queue join/poll)
NEXT_PUBLIC_DEMO_SERVER_URL=http://localhost:4000   # demo-server (for checkout/release)
NEXT_PUBLIC_EVENT_PUBLIC_KEY=                        # pre-filled from dashboard link

## Design Direction:
- Dark theme, sneaker-drop / streetwear aesthetic
- Think Nike SNKRS app meets terminal aesthetic
- Monospace accents, bold typography, high contrast
- Product: "FLASH-X1 Limited Edition" sneaker — price $249, only N available
- Use a placeholder gradient/pattern for the shoe image (no external images needed)
- The whole page should feel like a real product drop

## Page Flow (single page app with state transitions):

### State 1: PRODUCT PAGE (initial)
- Hero section: product name, price, "Only {stock} pairs available" (fetch from GET /api/queue/info?pk={publicKey})
- Large "JOIN THE QUEUE" button (pulsing green accent)
- Below the fold: "How it works" — 3 step cards:
  1. "Join the queue" — you enter the virtual line
  2. "Wait your turn" — fair, first-come-first-served
  3. "Checkout" — 15 minutes to complete purchase
- Estimated wait display from queue/info endpoint

### State 2: IN QUEUE (after clicking JOIN)
- userId: generate a random "user_" + 8 hex chars, store in localStorage
- Call POST {ENGINE_API_URL}/api/queue/join with { publicKey, userId }
- If WON instantly: skip to State 3
- If QUEUED: show queue position UI
  - Large position number: "You are #7 in line"
  - Animated progress indicator (dots, loading bar, something visual)
  - "Estimated wait: ~14 seconds" (position × 1000/rateLimit from response)
  - Poll GET /api/queue/status?pk={pk}&userId={userId} every 2 seconds
  - When status becomes WON: transition to State 3 with celebration animation
- If SOLD_OUT: show State 5

### State 3: WON — CHECKOUT PAGE
- Celebration animation (confetti, flash, something exciting but brief)
- "You're in! Complete your purchase."
- Token info displayed in a debug panel (collapsible, default collapsed):
  - JWT preview (first 20 chars + "...")
  - JTI (extracted from token by decoding the payload — base64 decode middle segment)
  - Expiry countdown timer (15:00 counting down)
- "Your item is reserved for 15 minutes"
- Countdown timer prominent at the top
- Fake checkout form (just for show — name, card fields, all disabled/prefilled with fake data)
- Two buttons:
  1. **"COMPLETE PURCHASE"** (green) — calls POST {DEMO_SERVER_URL}/api/checkout with the token
  2. **"Simulate Payment Failure"** (red outline, smaller) — calls POST {DEMO_SERVER_URL}/api/checkout/fail with the JTI

### State 4: ORDER CONFIRMED
- After successful checkout: show order confirmation
- "Order #ORD-XXXXXX confirmed!"
- "Token verified and redeemed on the server"
- Debug panel showing verify response details
- "Try to buy again" button — calls checkout AGAIN with same token to demonstrate 409 double-spend protection
- When 409 is returned: show error "TOKEN_ALREADY_USED — double-spend prevented!" with a green checkmark (this is a FEATURE, not a bug)

### State 5: SOLD OUT
- "Sold Out" in large text
- "All items have been claimed"
- Muted, desaturated design to convey finality

### State 6: RELEASED (after payment failure)
- After calling release: show "Payment failed — your spot has been released"
- "Stock returned to the pool. The next person in line will get your spot."
- Show the release response: { released: true, stockRestored: 1 }
- "Return to product page" button to start over

## Debug Panel (always visible at bottom of page, collapsible):
- Title: "🔧 FlashEngine Debug Console"
- Shows every API call in real-time as a log:
  - Timestamp | Method | URL | Status | Response time
  - e.g., "14:32:05 | POST /api/queue/join | 202 | 12ms"
  - e.g., "14:32:07 | GET /api/queue/status | 200 WON | 3ms"
  - e.g., "14:32:15 | POST /api/checkout | 200 verified | 1204ms"
  - e.g., "14:32:20 | POST /api/checkout | 409 ALREADY_USED | 8ms"
- Color-coded: green for success, yellow for queue, red for errors, blue for info
- This is the MOST IMPORTANT part for interviews — the interviewer can see every API interaction

## URL Parameters:
- ?pk={publicKey} — pre-fills the event public key (linked from dashboard)
- ?engine={engineUrl} — overrides ENGINE_API_URL
- ?server={serverUrl} — overrides DEMO_SERVER_URL
- If pk is missing: show a config form asking for publicKey, engineUrl, serverUrl

## API Calls (all direct fetch, NO SDK):
- GET {ENGINE_API_URL}/api/queue/info?pk={pk} — pre-join info
- POST {ENGINE_API_URL}/api/queue/join — join queue (add x-demo-bypass: true header)
- GET {ENGINE_API_URL}/api/queue/status?pk={pk}&userId={userId} — poll (add x-demo-bypass: true)
- POST {DEMO_SERVER_URL}/api/checkout — verify via demo-server
- POST {DEMO_SERVER_URL}/api/checkout/fail — release via demo-server

## JWT Decoding (client-side, for display only):
To extract jti from the token without a library:
const payload = JSON.parse(atob(token.split('.')[1]));
const jti = payload.jti;
const exp = payload.exp; // unix timestamp for countdown

## package.json scripts:
- "dev": "next dev -p 3001" (or vite dev on port 3001)
- "build": "next build"
```

---

## Prompt DEMO-STORE-3 — Dashboard Integration (Test Event Link)

```
CONTEXT: The Flash Sale Engine dashboard has an event detail page at apps/saas-dashboard/src/app/dashboard/events/[id]/page.tsx and an admin event detail at apps/saas-dashboard/src/app/admin/events/[id]/page.tsx.

Add a "Test This Event" feature to both event detail pages, plus update the existing /demo page to link to the demo storefront.

## 1. Event Detail Page — "Test This Event" Card

On the event detail page (both client and admin versions), add a new card/section BELOW the existing integration snippet section:

Card title: "Live Demo"
Card description: "Open a simulated storefront to test the full purchase flow — queue, verify, and release."

Contents:
- "Open Demo Storefront" button (primary, opens in new tab)
  - URL: {DEMO_CLIENT_URL}?pk={event.publicKey}&engine={ENGINE_API_URL}
  - Where DEMO_CLIENT_URL defaults to http://localhost:3001 in dev, or can be set via NEXT_PUBLIC_DEMO_CLIENT_URL env var
- Below the button, three smaller links:
  1. "Open Traffic Simulator" → links to /demo?pk={event.publicKey} (the existing dot grid page)
  2. "Open Demo Server Logs" → just shows text: "Run `cd apps/demo/demo-server && npm run dev` — watch terminal for verify/release logs"

- Show a "Setup Instructions" collapsible section:
  ```
  1. Copy your signing secret from the Keys section above
  2. Start the demo server:
     cd apps/demo/demo-server
     cp .env.example .env
     # Set EVENT_PUBLIC_KEY and EVENT_SIGNING_SECRET
     npm install && npm run dev
  3. Start the demo storefront:
     cd apps/demo/demo-client
     cp .env.example .env
     # Set NEXT_PUBLIC_EVENT_PUBLIC_KEY
     npm install && npm run dev
  4. Click "Open Demo Storefront" above
  ```

## 2. Existing /demo Page — Add Navigation

On the existing /demo traffic simulator page (apps/saas-dashboard/src/app/demo/page.tsx), add a tab or toggle at the top:

Two modes:
- **Traffic Simulator** (current functionality — dot grid, mass simulation)
- **Storefront Demo** → links out to the demo-client URL with the currently-entered publicKey

Add a small info banner: "Traffic Simulator tests queue throughput with many virtual users. Storefront Demo tests the full purchase flow (verify + release) as a single user."

## 3. README for the demo folder

Create apps/demo/README.md:

# FlashEngine Demo Suite

Two demo tools for testing and showcasing the Flash Sale Engine.

## Traffic Simulator (built into dashboard)
URL: {dashboard}/demo
Tests queue throughput with 50-500 virtual users. Shows the dot grid visualization.
No separate setup needed — runs in the dashboard.

## Demo Storefront (demo-client + demo-server)
Simulates a real e-commerce integration. Shows the complete flow:
1. Customer joins queue → waits → wins
2. Customer clicks checkout → demo-server calls /verify → token redeemed
3. Customer can simulate payment failure → demo-server calls /release → stock restored

### Quick Start:
# Terminal 1: engine-gateway (must be running)
cd apps/engine-gateway && npm run dev

# Terminal 2: demo server (mock e-commerce backend)
cd apps/demo/demo-server
cp .env.example .env
# Edit .env: set EVENT_PUBLIC_KEY, EVENT_SIGNING_SECRET from your event
npm install && npm run dev

# Terminal 3: demo client (mock storefront)
cd apps/demo/demo-client
cp .env.example .env  
# Edit .env: set NEXT_PUBLIC_EVENT_PUBLIC_KEY
npm install && npm run dev

# Open http://localhost:3001 in browser

### What to show interviewers:
1. Open the demo storefront in one browser window
2. Open the dashboard event detail page in another
3. Walk through: join queue → win → checkout (verify) → see token redeemed
4. Try checkout AGAIN — show the 409 double-spend protection
5. Reset: join as new user → win → simulate payment failure (release)
6. Show the demo-server terminal — every verify/release call logged with HMAC details
7. Switch to dashboard — show stats updating in real-time
```

---

## Prompt DEMO-STORE-4 — Demo Flow Polish & Edge Cases

```
Review and fix the demo-client and demo-server created in previous prompts. Handle these edge cases:

## Edge Cases to Handle:

1. **Token expiry during checkout**: If the user waits too long (>15 min) on the checkout page and then clicks "Complete Purchase", the verify call will fail. Show a friendly "Your reservation expired. Please rejoin the queue." message and transition back to State 1.

2. **Event not active**: If the user loads the page but the event isn't ACTIVE (PENDING, ENDED, PAUSED), show an appropriate state:
   - PENDING: "This sale hasn't started yet. Check back soon."
   - ENDED: "This sale has ended."
   - PAUSED: "This sale is temporarily paused. Please wait." + auto-retry info fetch every 10s

3. **Demo server not running**: If the demo-client can't reach the demo-server (CORS error or connection refused on /api/checkout), show a clear error: "Demo server not running. Start it with: cd apps/demo/demo-server && npm run dev"

4. **Already joined**: If the user refreshes the page mid-queue, check localStorage for existing userId + publicKey. If found, resume polling instead of rejoining.

5. **Multiple tabs**: Warn if the user opens the demo in multiple tabs with the same userId. Use BroadcastChannel API or localStorage event to detect.

## Visual Polish:

1. The state transitions should have smooth animations (fade, slide).

2. The countdown timer on the checkout page should:
   - Show green when > 5 minutes remaining
   - Show yellow when 1-5 minutes remaining  
   - Show red + pulse when < 1 minute remaining
   - Show "EXPIRED" when 0

3. The debug console should auto-scroll to the latest entry.

4. Add a "Reset Demo" button (top-right corner) that clears localStorage and reloads — useful for running the demo multiple times.

## Demo Server Polish:

1. On startup, print a formatted banner:
   ┌──────────────────────────────────────┐
   │  FlashEngine Demo Server             │
   │  Listening on port 4000              │
   │  Engine: http://localhost:3000       │
   │  Event:  clxyz123...                 │
   └──────────────────────────────────────┘

2. Log every request with timing:
   [14:32:15] POST /api/checkout
     → Verifying token with engine...
     → HMAC: (not needed for verify, only release)
     → Engine responded: 200 { valid: true }
     → Simulating payment (1.5s delay)...
     ✅ Order confirmed: ORD-847291 (1523ms total)

   [14:32:20] POST /api/checkout (DUPLICATE)
     → Verifying token with engine...
     → Engine responded: 409 { error: "Token already used" }
     ❌ Double-spend prevented!

   [14:32:30] POST /api/checkout/fail
     → Constructing HMAC...
     → Timestamp: 1715443950000
     → Message: 1715443950000.{"jti":"abc-123","reason":"PAYMENT_FAILED"}
     → Signature: sha256=a1b2c3d4...
     → Calling engine /api/queue/release...
     → Engine responded: 200 { released: true, stockRestored: 1 }
     🔄 Stock released back to pool

3. Add a GET /api/logs endpoint that returns the last 50 log entries as JSON (so the demo-client debug panel can optionally pull server-side logs too).
```

---

## Running Order & What Each Prompt Does

| Prompt | Creates | Demonstrates |
|--------|---------|-------------|
| DEMO-STORE-1 | `apps/demo/demo-server/` | Verify flow (RS256 JWT verification), Release flow (HMAC construction + stock return) |
| DEMO-STORE-2 | `apps/demo/demo-client/` | Full user experience: queue → win → checkout → double-spend protection → release |
| DEMO-STORE-3 | Dashboard changes + README | "Test This Event" button, links between tools |
| DEMO-STORE-4 | Polish & edge cases | Production-quality error handling, visual polish |

## Interview Demo Script (Updated)

### Setup (before interview):
1. Engine-gateway running (deployed or local)
2. Create + activate a TEST MODE event in dashboard
3. Copy publicKey + signingSecret
4. Start demo-server with those credentials
5. Start demo-client

### Demo Flow (show to interviewer):

**Tab 1: Dashboard** — event detail page, stats at zero

**Tab 2: Demo Storefront** — the fake sneaker store

1. "This is what a client's website looks like with FlashEngine integrated."
2. Click "JOIN THE QUEUE" → show queue position updating
3. When WON → "I got a purchase token. It's an RS256 JWT — signed by a per-event private key."
4. Click "COMPLETE PURCHASE" → show debug panel: POST /checkout → verify → success
5. "Now watch — I'll try to use the same token again." → Click "Try to buy again"
6. Show 409: "Double-spend prevented. The JTI is a primary key — second INSERT fails."
7. "Now let me show the release flow." → Reset, join again, win again
8. Click "Simulate Payment Failure" → show HMAC construction in demo-server terminal
9. "Stock returned to the pool. The next person in line gets my spot."
10. Switch to Tab 1: "Dashboard shows the stats — 2 verifications, 1 release, stock restored."

This covers everything the traffic simulator doesn't: **verify**, **release**, **double-spend protection**, and **HMAC authentication**.
