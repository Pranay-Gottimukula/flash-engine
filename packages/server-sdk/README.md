# @flashengine/server

Node.js SDK for FlashEngine — handles token verification and ticket release on your backend server.

## Installation

```bash
npm install @flashengine/server
```

Requires Node.js ≥ 18.0.0. No runtime dependencies — uses Node built-in `crypto` and `fetch`.

## Quick start

```ts
import { FlashEngine } from '@flashengine/server';

const fe = new FlashEngine({
  publicKey: process.env.FLASHENGINE_PUBLIC_KEY!,
  signingSecret: process.env.FLASHENGINE_SIGNING_SECRET!,
});

// Verify a purchase token (prevents double-spend)
const result = await fe.verifyToken(req.body.token);
// result: { valid: true, userId, eventId, jti }

// Release a ticket back to the pool
await fe.releaseTicket(result.jti, 'PAYMENT_FAILED');
```

## Token verification

`verifyToken(token)` makes a POST to the FlashEngine API. It validates the token signature **and** marks it as used, preventing double-spend. Call this once, just before charging the customer.

```ts
try {
  const { userId, eventId, jti } = await fe.verifyToken(token);
  await chargeCustomer(userId);
  await db.createOrder({ userId, eventId, jti });
} catch (err) {
  if (err instanceof FlashEngineError) {
    if (err.code === 'TOKEN_USED') return res.status(409).send('Ticket already purchased');
    if (err.code === 'INVALID_TOKEN') return res.status(401).send('Invalid token');
  }
  throw err;
}
```

## Releasing tickets

`releaseTicket(jti, reason)` returns a ticket to the pool when a purchase fails. The SDK handles all HMAC signing internally — you never need to construct signatures manually.

```ts
await fe.releaseTicket(jti, 'PAYMENT_FAILED');
// or: 'EXPIRED' | 'CANCELLED'
```

## Offline verification

`verifyTokenOffline(token)` verifies the RSA signature locally without an API call. It does **not** prevent double-spend. Use it for lightweight pre-checks — showing a checkout page, validating before displaying a form — but always call `verifyToken()` before charging.

```ts
// Fast pre-check (no API call)
const info = await fe.verifyTokenOffline(token);
// info: { userId, publicKey, eventId, jti, expiresAt }

// Before charging — full online verify
const result = await fe.verifyToken(token);
```

You can supply your own RSA public key PEM to skip the JWKS fetch entirely:

```ts
const fe = new FlashEngine({
  publicKey: '...',
  signingSecret: '...',
  rsaPublicKey: process.env.FLASHENGINE_RSA_PUBLIC_KEY, // PEM string
});
```

## Error handling

All errors thrown by this SDK are instances of `FlashEngineError`:

```ts
import { FlashEngine, FlashEngineError } from '@flashengine/server';

try {
  await fe.verifyToken(token);
} catch (err) {
  if (err instanceof FlashEngineError) {
    console.error(err.code);       // 'INVALID_TOKEN' | 'TOKEN_USED' | 'PK_MISMATCH' | ...
    console.error(err.statusCode); // HTTP status if applicable
    console.error(err.message);    // Human-readable message
  }
}
```

| Code | Cause |
|---|---|
| `INVALID_TOKEN` | Token signature invalid |
| `TOKEN_USED` | Token already consumed |
| `PK_MISMATCH` | Wrong public key for this event |
| `HMAC_FAILED` | Release request signature invalid |
| `TICKET_NOT_FOUND` | JTI does not exist |
| `ALREADY_RELEASED` | Ticket already released |
| `TOKEN_EXPIRED` | Token past its expiry (offline only) |
| `JWKS_FETCH_FAILED` | Could not fetch public key |
| `NETWORK_ERROR` | Request did not reach the server |

## TypeScript types

```ts
import type {
  FlashEngineOptions,
  VerifyResult,
  ReleaseResult,
  ReleaseReason,
  OfflineVerifyResult,
} from '@flashengine/server';
```

## Non-Node.js backends

For raw HTTP examples (Python, Go, Ruby, etc.) see the [FlashEngine HTTP API docs](https://docs.flashengine.dev/api/release) — to be published.
