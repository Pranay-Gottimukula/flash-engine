# FlashEngine — Minimal SDK Integration Demo

A lightweight implementation demonstrating real FlashEngine integration.
Uses `@flashengine/browser` and `@flashengine/server` via local path imports.

## Setup

### 1. Build the SDKs (required first)

```bash
cd packages/browser-sdk && npm install && npm run build
cd packages/server-sdk && npm install && npm run build
```

### 2. Configure demo-server

```bash
cd apps/demo/demo-server
cp .env.example .env
# Fill in EVENT_PUBLIC_KEY and EVENT_SIGNING_SECRET from your FlashEngine dashboard
npm install
npm run dev
```

### 3. Configure demo-client

```bash
cd apps/demo/demo-client
cp .env.example .env
# Fill in VITE_EVENT_PUBLIC_KEY (same value as EVENT_PUBLIC_KEY above)
npm install
npm run dev
```

## Environment Variables

### demo-server (`apps/demo/demo-server/.env`)

| Variable | Description | Default |
|---|---|---|
| `ENGINE_API_URL` | FlashEngine gateway URL | `http://localhost:3000` |
| `EVENT_PUBLIC_KEY` | Event public key (from dashboard) | — |
| `EVENT_SIGNING_SECRET` | Signing secret for HMAC (from dashboard) | — |
| `PORT` | Port to listen on | `4000` |

### demo-client (`apps/demo/demo-client/.env`)

| Variable | Description | Default |
|---|---|---|
| `VITE_ENGINE_API_URL` | FlashEngine gateway URL | `http://localhost:3000` |
| `VITE_DEMO_SERVER_URL` | demo-server URL | `http://localhost:4000` |
| `VITE_EVENT_PUBLIC_KEY` | Event public key (pre-fills the config form) | — |

## SDK Integration

### demo-server → `@flashengine/server`

```ts
import { FlashEngine, FlashEngineError } from '@flashengine/server';

const engine = new FlashEngine({
  publicKey:     process.env.EVENT_PUBLIC_KEY!,
  signingSecret: process.env.EVENT_SIGNING_SECRET!,
  apiUrl:        process.env.ENGINE_API_URL ?? 'http://localhost:3000',
});

// Verify a purchase JWT
const result = await engine.verifyToken(token);

// Release a ticket back to the pool
await engine.releaseTicket(jti, 'PAYMENT_FAILED');
```

### demo-client → `@flashengine/browser`

```ts
import { FlashQueue } from '@flashengine/browser';

const queue = new FlashQueue({ apiUrl, publicKey, userId });

queue.on('won',      ({ token })     => { /* proceed to checkout */ });
queue.on('queued',   ({ position })  => { /* show position in queue */ });
queue.on('sold_out', ()              => { /* show sold-out page */ });
queue.on('error',    ({ message })   => { /* handle error */ });

await queue.join();
```

## Architecture

```
demo-client (Vite + React)
    │
    ├── @flashengine/browser  ──► FlashEngine Gateway (engine-gateway)
    │   └── FlashQueue.join()      /api/queue/join, /api/queue/status
    │
    └── fetch → demo-server ──────────────────────────────────────────
                    │
                    └── @flashengine/server ──► FlashEngine Gateway
                        ├── engine.verifyToken()   /api/queue/verify
                        └── engine.releaseTicket() /api/queue/release
```
