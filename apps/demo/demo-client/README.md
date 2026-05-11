# demo-client

Fake sneaker storefront demonstrating FlashEngine queue integration.

## Quick start

```bash
cp .env.example .env
# Fill in VITE_EVENT_PUBLIC_KEY (from dashboard)
npm install
npm run dev        # http://localhost:3001
```

Or pass everything via URL params (no .env needed):

```
http://localhost:3001?pk=YOUR_PUBLIC_KEY&engine=http://localhost:3000&server=http://localhost:4000
```

## What it shows

| State | Trigger |
|---|---|
| Product page | Initial load |
| In queue | Click "Join the Queue" → QUEUED response |
| Checkout | WON (instant or after polling) |
| Order confirmed | POST /api/checkout → 200 |
| Double-spend blocked | Click "Try again" → 409 |
| Released | Click "Simulate Payment Failure" |
| Sold out | SOLD_OUT from join/poll |

The **Debug Console** (bottom of page) logs every API call with method, URL, status, and latency in real time.

## Environment

| Variable | Default | Description |
|---|---|---|
| `VITE_ENGINE_API_URL` | `http://localhost:3000` | engine-gateway URL |
| `VITE_DEMO_SERVER_URL` | `http://localhost:4000` | demo-server URL |
| `VITE_EVENT_PUBLIC_KEY` | — | Event public key from dashboard |
