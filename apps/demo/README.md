# FlashEngine Demo Suite

Two demo tools for testing and showcasing the Flash Sale Engine.

---

## Traffic Simulator (built into dashboard)

**URL:** `{dashboard}/demo`

Tests queue throughput with 50–500 virtual users. Shows the dot grid visualization — each dot represents one simulated user, colour-coded by state (joining → queued → won / sold out).

No separate setup needed — runs entirely in the dashboard. Point it at any active event by pasting the public key.

---

## Demo Storefront (demo-client + demo-server)

Simulates a real e-commerce integration. Shows the complete purchase flow as a single customer:

1. Customer joins queue → waits → wins a purchase token
2. Customer clicks checkout → demo-server calls `/verify` → token redeemed in DB
3. Customer can simulate payment failure → demo-server calls `/release` → stock restored to pool

### Quick Start

```bash
# Terminal 1: engine-gateway (must be running)
cd apps/engine-gateway && npm run dev

# Terminal 2: demo server (mock e-commerce backend)
cd apps/demo/demo-server
cp .env.example .env
# Edit .env: set EVENT_PUBLIC_KEY and EVENT_SIGNING_SECRET from your event detail page
npm install && npm run dev

# Terminal 3: demo client (mock storefront)
cd apps/demo/demo-client
cp .env.example .env
# Edit .env: set VITE_EVENT_PUBLIC_KEY (same public key as above)
npm install && npm run dev

# Open http://localhost:3001 in browser
```

Or skip the `.env` entirely — pass everything via URL params:

```
http://localhost:3001?pk=YOUR_PUBLIC_KEY&engine=http://localhost:3000&server=http://localhost:4000
```

### Environment Variables

**demo-server** (`apps/demo/demo-server/.env`):

| Variable | Description |
|---|---|
| `ENGINE_API_URL` | engine-gateway URL (default: `http://localhost:3000`) |
| `EVENT_PUBLIC_KEY` | Public key from the event detail page |
| `EVENT_SIGNING_SECRET` | Signing secret from the event detail page — used to sign HMAC on `/release` calls |
| `PORT` | Port to listen on (default: `4000`) |

**demo-client** (`apps/demo/demo-client/.env`):

| Variable | Description |
|---|---|
| `VITE_ENGINE_API_URL` | engine-gateway URL (default: `http://localhost:3000`) |
| `VITE_DEMO_SERVER_URL` | demo-server URL (default: `http://localhost:4000`) |
| `VITE_EVENT_PUBLIC_KEY` | Public key (can also be passed as `?pk=` URL param) |

---

### What to Show Interviewers

1. Open the demo storefront (`http://localhost:3001`) in one browser window
2. Open the dashboard event detail page in another window
3. Walk through the full flow:
   - Click **Join the Queue** → watch queue position count down
   - Win a token → see the JWT and JTI displayed in the debug panel
   - Click **Complete Purchase** → watch demo-server verify the token → order confirmed
4. Click **"Try to buy again with same token"** — show the **409 double-spend prevention** (this is a feature, not a bug)
5. Reset: join as a new user → win → click **Simulate Payment Failure**
   - Watch demo-server call `/release` with HMAC signature
   - Stock is atomically returned to the pool
6. Open the demo-server terminal — every verify/release call is logged with HMAC construction steps in colour
7. Switch to the dashboard event detail page — stats (queue depth, admitted, released) update in real time
