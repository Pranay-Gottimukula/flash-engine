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
