# Flash Engine — Demo Simulator Prompts

> These build a traffic simulator for live interview demos. Feed sequentially.

---

## Prompt DEMO-1 — Traffic Simulator Page

```
IMPORTANT: Read /mnt/skills/public/frontend-design/SKILL.md before writing any code.

Create a standalone demo simulator page at apps/saas-dashboard/src/app/demo/page.tsx.

This page is NOT behind auth — it's a public page used to simulate traffic during interviews. It does NOT use the SDK package — it makes direct fetch calls (so there's no dependency on the npm package being published).

Layout: full-screen dark page, no sidebar, no dashboard layout. Standalone.

Top section — Configuration panel (Card):
- "FlashEngine Demo Simulator" title with a Zap icon
- Input fields:
  - API URL: text input, default from NEXT_PUBLIC_API_URL env var
  - Event Public Key: text input, empty (paste from dashboard)
  - Number of Users: number input, default 50, min 5, max 500
  - Ramp-up Duration (seconds): number input, default 10, min 1, max 60 — users join spread across this window
  - Poll Interval (ms): number input, default 2000
- "Start Simulation" big green button
- "Stop" red button (appears when running, replaces Start)
- "Reset" ghost button to clear all state

Middle section — Live Stats (row of stat cards):
- Total Users: N
- Joining: N (currently sending POST /join)
- Queued: N (waiting in queue)
- Won: N (received token)
- Sold Out: N
- Errors: N
- Elapsed Time: Xs

Bottom section — User Activity Log (scrollable, max-height 400px):
- Each line shows: [timestamp] User user_042: WON (token: eyJ...first20chars)
- Or: [timestamp] User user_087: QUEUED (position: 14, ~3s wait)
- Or: [timestamp] User user_091: SOLD_OUT
- Color coded: green for WON, blue for QUEUED, red for SOLD_OUT, yellow for errors
- Auto-scrolls to bottom as new entries appear
- Show most recent 200 entries max (older ones drop off)

Between stats and log — a simple progress bar:
- Width = (won + soldOut) / totalUsers * 100%
- Green portion = won, Red portion = soldOut
- Shows "X / Y resolved" text overlay

How the simulation works internally:

1. On "Start": create an array of N virtual users with IDs like `demo_user_001` through `demo_user_N`

2. Ramp-up: spread the joins across the ramp-up duration. If 50 users over 10 seconds, that's 1 user every 200ms. Use setTimeout with incrementing delays:
   users.forEach((user, i) => {
     const delay = (i / totalUsers) * rampUpDurationMs;
     setTimeout(() => joinUser(user), delay);
   });

3. joinUser(userId) function:
   - Update user state to 'joining', increment joining count
   - POST to {apiUrl}/api/queue/join with { publicKey, userId }
   - On response:
     - "WON": update state to 'won', save token, log it, increment won count
     - "QUEUED": update state to 'queued', log with position, start polling for this user
     - "SOLD_OUT": update state to 'sold_out', log it, increment soldOut count
     - "ALREADY_JOINED": start polling (recovery case)
     - Error: update state to 'error', log it
   - Decrement joining count after response

4. Polling for queued users:
   - For each queued user, poll GET {apiUrl}/api/queue/status?pk={pk}&userId={userId}
   - Poll interval from config, add ±300ms jitter
   - On "WON": stop polling, update state, log, increment won
   - On "SOLD_OUT": stop polling, update state, log, increment soldOut
   - On "QUEUED": log position update (but don't spam the log — only log if position changed)
   - Continue polling until resolved or stopped

5. "Stop" button: clears all pending timeouts and polling intervals. Users that already resolved keep their state.

6. "Reset" button: stop everything + clear all state back to initial.

State management: use React useState + useRef for the user array and timers. Do NOT use useEffect for the timers — manage them manually with refs so Stop/Reset work cleanly.

IMPORTANT — Concurrency control:
- Don't fire all 500 fetches simultaneously — the browser will choke and the rate limiter will block you
- Max 10 concurrent join requests at a time. Use a simple semaphore:
  let inFlight = 0;
  async function joinUser(userId) {
    while (inFlight >= 10) await sleep(50);
    inFlight++;
    try { ... } finally { inFlight--; }
  }
- Max 20 concurrent poll requests at a time (same pattern)

IMPORTANT — CORS:
- The engine-gateway must allow requests from the dashboard domain
- Add a note at the top of the page: "Make sure your engine has CORS configured for this domain"

Style: dark theme matching the dashboard aesthetic (surface bg, green accent, mono font for the log). But simpler — no sidebar, just a centered max-w-4xl container.

Do NOT import from @flashengine/browser — this page makes raw fetch calls. The SDK might not be published yet, and this avoids that dependency.
```

---

## Prompt DEMO-2 — CORS Fix for Engine Gateway

```
Read apps/engine-gateway/src/server.ts.

Make sure CORS is configured to allow requests from any origin during development and from specific origins in production.

If cors middleware is not already installed:
  npm install cors @types/cors

In server.ts, add CORS BEFORE all routes:

import cors from 'cors';

app.use(cors({
  origin: process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map(o => o.trim())
    : '*',   // allow all in dev, restrict in prod
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'x-public-key',
    'x-signature',
    'x-timestamp',
    'x-admin-secret',
  ],
  credentials: true,
}));

Add to .env.example:
  CORS_ORIGINS="https://your-dashboard.vercel.app,http://localhost:3000"

For Railway deployment, set CORS_ORIGINS to your actual Vercel dashboard URL.

Also check: are the queue routes (POST /join, GET /status, GET /info) already working with CORS? The browser simulator will call these directly. Make sure OPTIONS preflight requests are handled (the cors middleware does this automatically).
```

---

## Prompt DEMO-3 — Visual Enhancements for Demo

```
IMPORTANT: Read /mnt/skills/public/frontend-design/SKILL.md before writing any code.

Enhance the demo simulator page with visual elements that make the demo more impressive during interviews.

1. Add a user grid visualization between the progress bar and the log:
   - Show each virtual user as a small colored dot in a grid layout (like a stadium seating chart)
   - Dot colors:
     - Gray: idle (not yet started)
     - Blue pulse: joining (animating)
     - Yellow: queued (waiting)
     - Green: won
     - Red: sold out
     - Orange: error
   - Dot size: 12x12px with 2px gap
   - Grid wraps naturally with flexbox
   - On hover over a dot: show a tooltip with "user_042: QUEUED (pos: 7)"
   - Watching 50-100 dots transition from gray → blue → yellow → green/red in real time is visually compelling

2. Add a live rate counter in the stats row:
   - "Join Rate": shows joins per second over the last 3 seconds (rolling window)
   - "Win Rate": shows wins per second over the last 3 seconds
   - Calculate by tracking timestamps of events in an array and filtering to last 3000ms

3. Add a small timer display showing how long since simulation started (MM:SS format, updating every second)

4. Make the progress bar animated — the green and red portions should transition smoothly (CSS transition on width, 300ms ease)

5. At the bottom of the page, add a subtle footer:
   "FlashEngine Demo — simulating {N} concurrent users against {publicKey.slice(0,8)}..."
   Only visible while simulation is running.

Keep the page performant — with 500 users, React should NOT re-render on every single state change. Use useRef for the user states array and only trigger a setState for the summary counts on a 200ms throttle:
  const updateTimer = useRef<ReturnType<typeof setInterval>>();
  // On start:
  updateTimer.current = setInterval(() => {
    // Read from refs, compute counts, setState once
  }, 200);
```

---

## Prompt DEMO-4 — Demo Script Cheat Sheet

```
Create a markdown file at apps/saas-dashboard/public/demo-script.md that contains the interview demo script.

Content:

# FlashEngine — Live Demo Script

## Pre-Demo Setup (do this before the interview)

1. Deploy engine-gateway to Railway
   - Set env vars: DATABASE_URL, REDIS_URL, AUTH_JWT_SECRET, CORS_ORIGINS
   - Run: npx prisma migrate deploy && npx prisma db seed

2. Deploy saas-dashboard to Vercel
   - Set env var: NEXT_PUBLIC_API_URL = your Railway URL

3. Create test accounts:
   - Super admin: already seeded (admin@flashengine.dev)
   - Client: sign up via the dashboard

4. Create a TEST MODE event:
   - Log in as the client
   - Create event: name "Demo Flash Sale", stock 20, rate limit 5, mode TEST
   - Copy the publicKey
   - Activate the event

5. Prepare browser tabs:
   - Tab 1: Dashboard client view → event detail page (shows live stats)
   - Tab 2: Dashboard admin view → /admin/live (shows war room)
   - Tab 3: /demo page with publicKey pre-filled, 50 users, 10s ramp-up

## During the Interview

### Opening (30 seconds)
"This is a B2B SaaS platform that protects e-commerce sites during flash sales. When 10,000 people try to buy 100 items simultaneously, most databases crash. My engine uses Redis atomic operations and a leaky bucket algorithm to handle this."

### Show the Architecture (1 minute)
Open the docs → Architecture page. Walk through the flow diagram.
Key points:
- Redis Lua scripts for atomicity — no race conditions
- Leaky bucket protects the client's payment DB
- RS256 JWTs so the client can verify offline
- Per-event keypairs — one compromise doesn't affect others

### Live Demo (2-3 minutes)
1. "Here's a flash sale with 20 items in stock. Rate limit is 5 per second — that's how fast the client's payment system can handle checkouts."

2. Show Tab 1 — the event detail page. "Stock is 20, nothing has happened yet."

3. Switch to Tab 3 — the simulator. "I'm going to simulate 50 users trying to buy simultaneously."

4. Click "Start Simulation"

5. Watch the dots turn from gray → blue → yellow → green/red
   "See the first 5 turned green immediately — the leaky bucket had tokens available. The rest entered the queue."

6. Switch to Tab 1 — "The dashboard updates in real time. Watch the funnel fill."

7. Switch to Tab 2 — "The super admin war room shows this event's stock depleting."

8. Wait for completion. "20 users won, 30 got sold out. Zero database crashes, zero overselling."

### Technical Deep Dive (as long as they want)
- "Why Redis over RabbitMQ?" — flash sales run for minutes, sub-ms feedback is the product
- "What if Redis dies?" — circuit breaker returns 503, reconcile from Postgres
- "How do you prevent double-spending?" — UsedJti primary key, race loser gets 409
- "What about horizontal scaling?" — drain loop leader election needed, single server by design for now

### Closing
"The client integrates with a 10-line SDK. Their backend calls verify before charging, release if payment fails. The whole security model ensures even a fully compromised client can't forge purchase tokens."

## Emergency Recovery
- If the event stock runs out mid-demo: wait 5 minutes (test mode auto-resets) or end + create a new event
- If Redis hits rate limit (Upstash free tier): wait, or upgrade to paid tier before the interview
- If CORS errors: check CORS_ORIGINS in Railway env vars
- If login fails: re-run prisma db seed on Railway
```

---

## Prompt DEMO-5 — Upstash Command Budget Warning

```
Add a small Upstash-aware warning to the demo simulator page.

At the top of the configuration panel, add a collapsible info banner (default collapsed):
- Icon: AlertTriangle (amber)
- Title: "Free Tier Limits"
- On expand, show:
  "Upstash free tier allows 10,000 Redis commands/day. Each simulated user costs ~15-20 commands (join + polls + drain processing). Budget guide:
  
  50 users ≈ 1,000 commands — safe, run 8-10 times per day
  100 users ≈ 2,000 commands — moderate, run 4-5 times
  200 users ≈ 4,000 commands — heavy, run 2 times
  500 users ≈ 10,000 commands — one run, then done for the day
  
  For interview demos, use 50-100 users. That's visually impressive enough and leaves room for multiple runs."

Also: after the simulation completes, show the estimated commands used:
  const estimatedCommands = Math.ceil(totalUsers * 17);
  // 17 is average: 8 for join Lua + 3 polls × 2 cmds + 3 drain cmds

Display as a small muted line below the progress bar:
  "Estimated Redis commands used: ~{estimatedCommands}"
```
