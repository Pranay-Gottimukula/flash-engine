# Flash Sale Engine — Claude Code Prompts: SDK + Docs + Features

## How to use these prompts

Feed them to Claude Code **sequentially**. Each prompt assumes the previous ones are complete and working. After each prompt, verify the output before moving to the next — run builds, check that the server starts, test manually.

The prompts are organized into sections:
- **S1–S6**: Browser SDK (`@flashengine/browser`)
- **S7–S10**: Server SDK (`@flashengine/server`)
- **S11**: New gateway endpoint needed by SDK
- **D1–D8**: Dashboard docs section (full content pages)
- **F1–F5**: Additional features (test mode, timeline, live monitoring, key rotation, webhook retries)

---

# SECTION S — BROWSER SDK

---

## Prompt S1 — Package scaffolding and types

```
Create the browser SDK package for FlashEngine at `packages/browser-sdk/`. This is a lightweight client-side library that e-commerce sites import to connect their storefront to the FlashEngine queue.

1. Initialize the package:
   - `packages/browser-sdk/package.json`:
     - name: "@flashengine/browser"
     - version: "0.1.0"
     - main: "dist/index.cjs"
     - module: "dist/index.mjs"
     - types: "dist/index.d.ts"
     - exports: map "." to { import, require, types } and "./react" to { import, require, types } pointing at react entry
     - files: ["dist"]
     - sideEffects: false
     - peerDependencies: { "react": ">=17.0.0" } (optional peer — the core has no React dependency)
     - devDependencies: tsup, typescript, react, @types/react
   - `packages/browser-sdk/tsconfig.json`:
     - target: ES2020
     - module: ES2020
     - moduleResolution: bundler
     - jsx: react-jsx
     - strict: true
     - declaration: true
     - outDir: dist
     - include: ["src"]
   - `packages/browser-sdk/tsup.config.ts`:
     - Two entry points: "src/index.ts" and "src/react.ts"
     - format: ["esm", "cjs"]
     - dts: true
     - splitting: true
     - clean: true
     - external: ["react"]
     - minify: true

2. Create `packages/browser-sdk/src/types.ts` with all TypeScript types:

```ts
// Constructor options
export interface FlashQueueOptions {
  publicKey: string;
  userId: string;
  apiUrl?: string;           // defaults to 'https://api.flashengine.dev'
  pollIntervalMs?: number;   // defaults to server-provided value, fallback 2000
  maxPollRetries?: number;   // defaults to 100 (200 seconds at 2s intervals)
  debug?: boolean;           // logs internal state transitions to console
}

// Event payloads
export interface QueuedPayload {
  position: number;
  estimatedWaitMs: number;
}

export interface WonPayload {
  token: string;
  expiresAt: number;  // unix timestamp ms
}

export interface SoldOutPayload {}

export interface PausedPayload {
  retryAfter: number; // seconds
}

export interface PositionPayload {
  position: number;
  estimatedWaitMs: number;
}

export interface TicketExpiringPayload {
  token: string;
  expiresInMs: number;
}

export interface ErrorPayload {
  code: ErrorCode;
  message: string;
}

export type ErrorCode =
  | 'NETWORK_ERROR'
  | 'EVENT_NOT_FOUND'
  | 'EVENT_NOT_ACTIVE'
  | 'POLL_TIMEOUT'      // maxPollRetries exceeded
  | 'UNKNOWN';

// Event map for type-safe listeners
export interface FlashQueueEventMap {
  queued: QueuedPayload;
  won: WonPayload;
  sold_out: SoldOutPayload;
  paused: PausedPayload;
  position: PositionPayload;
  ticket_expiring: TicketExpiringPayload;
  error: ErrorPayload;
}

// Internal state machine
export type QueueState =
  | 'idle'
  | 'joining'
  | 'queued'
  | 'won'
  | 'sold_out'
  | 'paused'
  | 'error'
  | 'destroyed';

// API response types (what the gateway returns)
export interface JoinResponse {
  status: 'WON' | 'QUEUED' | 'SOLD_OUT' | 'ALREADY_JOINED' | 'PAUSED';
  token?: string;
  position?: number;
  pollUrl?: string;
  pollIntervalMs?: number;
  retryAfter?: number;
  message?: string;
}

export interface StatusResponse {
  status: 'WON' | 'QUEUED' | 'SOLD_OUT';
  token?: string;
  tokenExpired?: boolean;
  position?: number;
}

export interface QueueInfoResponse {
  status: string;
  queueLength: number;
  rateLimit: number;
  estimatedWaitMs: number;
}
```

3. Create a stub `packages/browser-sdk/src/index.ts` that just re-exports types for now:
```ts
export type * from './types';
```

4. Create a stub `packages/browser-sdk/src/react.ts`:
```ts
export {};
```

5. Verify the build works: `cd packages/browser-sdk && npx tsup`

Do NOT create any logic yet — just the scaffolding and types.
```
```
---

## Prompt S2 — Transport layer (fetch wrapper with retry and jitter)

```
Create the HTTP transport layer for the browser SDK at `packages/browser-sdk/src/transport.ts`.

This module handles all HTTP communication with the FlashEngine gateway. It must be resilient — users on flaky mobile connections during a flash sale can't afford dropped requests.

1. Create `packages/browser-sdk/src/transport.ts`:

```ts
export interface TransportOptions {
  apiUrl: string;
  debug: boolean;
}

export class Transport {
  private apiUrl: string;
  private debug: boolean;
  private controller: AbortController | null = null;

  constructor(options: TransportOptions) { ... }

  // POST /api/queue/join
  async join(publicKey: string, userId: string): Promise<JoinResponse> { ... }

  // GET /api/queue/status?pk=...&userId=...
  async status(publicKey: string, userId: string): Promise<StatusResponse> { ... }

  // GET /api/queue/info?pk=...  (new endpoint we'll add to gateway)
  async info(publicKey: string): Promise<QueueInfoResponse> { ... }

  // Cancel all in-flight requests
  abort(): void { ... }

  // Internal fetch wrapper
  private async request<T>(path: string, options?: RequestInit): Promise<T> { ... }
}
```

2. Implementation details for the `request` method:
   - Create a new AbortController for each request, store as this.controller
   - Set a 10-second timeout via AbortSignal.timeout (fallback: setTimeout + abort for older browsers)
   - On network error (TypeError from fetch, or AbortError that isn't from our destroy()):
     - Retry up to 3 times with exponential backoff: 1s, 2s, 4s
     - Add jitter: multiply delay by (0.5 + Math.random()) so it's between 50%-150% of base delay
     - If all retries fail, throw a typed error with code 'NETWORK_ERROR'
   - On non-2xx response: parse the JSON body and throw with the error message from the API
   - On successful response: parse and return JSON
   - If debug is true, console.log each request method + URL and response status

3. The `join` method:
   - POST to `${apiUrl}/api/queue/join`
   - Body: `{ publicKey, userId }`
   - Content-Type: application/json
   - Returns parsed JoinResponse

4. The `status` method:
   - GET to `${apiUrl}/api/queue/status?pk=${publicKey}&userId=${encodeURIComponent(userId)}`
   - Returns parsed StatusResponse

5. The `info` method:
   - GET to `${apiUrl}/api/queue/info?pk=${publicKey}`
   - Returns parsed QueueInfoResponse

6. The `abort` method:
   - If this.controller exists, call this.controller.abort()
   - Set this.controller to null

Import the response types from './types'. Make sure all methods handle the AbortError case (when destroy() is called mid-request) by NOT retrying — just let the error propagate silently.

Verify the build still works after adding this file.
```
```

---

## Prompt S3 — Core FlashQueue class (state machine + event emitter)

```
Create the core FlashQueue class at `packages/browser-sdk/src/flash-queue.ts`.

This is the main class users interact with. It's a state machine with an event emitter pattern.

1. Implement a minimal typed event emitter (do NOT import any library — keep bundle size minimal):

```ts
type Listener<T> = (payload: T) => void;

class TypedEmitter<EventMap> {
  private listeners = new Map<string, Set<Function>>();

  on<K extends keyof EventMap>(event: K, listener: Listener<EventMap[K]>): this { ... }
  off<K extends keyof EventMap>(event: K, listener: Listener<EventMap[K]>): this { ... }
  protected emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void { ... }
  removeAllListeners(): void { ... }
}
```

2. FlashQueue extends TypedEmitter<FlashQueueEventMap>:

```ts
export class FlashQueue extends TypedEmitter<FlashQueueEventMap> {
  private options: Required<FlashQueueOptions>;  // with defaults applied
  private transport: Transport;
  private state: QueueState = 'idle';
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private pollCount = 0;
  private expiryTimer: ReturnType<typeof setTimeout> | null = null;
  private currentToken: string | null = null;
  private rateLimit: number = 50;  // updated from server responses

  constructor(options: FlashQueueOptions) {
    // Apply defaults:
    // apiUrl: 'https://api.flashengine.dev'
    // pollIntervalMs: 2000
    // maxPollRetries: 100
    // debug: false
  }

  get currentState(): QueueState { return this.state; }

  async join(): Promise<void> { ... }
  destroy(): void { ... }
}
```

3. `join()` method logic:
   - If state is not 'idle', throw Error('Already joined. Call destroy() first.')
   - Set state to 'joining'
   - Try/catch the entire flow:
     - First, fire info() to get rateLimit (store it for estimatedWaitMs calculation). This is best-effort — if it fails, use default rateLimit of 50. Do NOT block join on this.
     - Call transport.join(publicKey, userId)
     - Handle each response status:
       a. 'WON': state → 'won', store token, emit 'won' with { token, expiresAt }, schedule ticket_expiring timer
       b. 'SOLD_OUT': state → 'sold_out', emit 'sold_out'
       c. 'QUEUED': state → 'queued', emit 'queued' with { position, estimatedWaitMs }, start polling
       d. 'ALREADY_JOINED': state → 'queued', start polling (user reconnected)
       e. 'PAUSED': state → 'paused', emit 'paused' with { retryAfter }, schedule delayed join retry after retryAfter seconds
   - On error: state → 'error', emit 'error' with code and message

4. Polling logic (private method `startPolling`):
   - Use setTimeout (not setInterval) for each poll — this prevents overlapping polls if a request is slow
   - Add jitter: actual delay = pollIntervalMs + random(-500, +500)
   - Check document.visibilityState:
     - If 'hidden', don't poll — listen for visibilitychange event, poll immediately when visible again
     - If 'visible', poll normally
   - Each poll:
     a. Increment pollCount. If pollCount >= maxPollRetries → state = 'error', emit error with 'POLL_TIMEOUT', stop
     b. Call transport.status(publicKey, userId)
     c. If 'WON' with token: state → 'won', emit 'won', schedule expiry timer, stop polling
     d. If 'WON' with tokenExpired: state → 'error', emit error 'Token expired before collection'
     e. If 'SOLD_OUT': state → 'sold_out', emit 'sold_out', stop polling
     f. If 'QUEUED': emit 'position' with { position, estimatedWaitMs }, schedule next poll
   - estimatedWaitMs = position * (1000 / this.rateLimit)
   - On fetch error during poll: DON'T stop polling — the transport already retried 3x. If it still failed, emit 'error' event but schedule next poll with doubled interval (backoff). Only stop on POLL_TIMEOUT.

5. Ticket expiry timer (private method `scheduleExpiryWarning`):
   - Parse JWT to extract exp claim (simple base64 decode of middle segment, JSON.parse)
   - Schedule setTimeout for (exp * 1000 - Date.now() - 60000) — fires 60 seconds before expiry
   - When it fires: emit 'ticket_expiring' with { token, expiresInMs: 60000 }

6. `destroy()` method:
   - Set state to 'destroyed'
   - Clear pollTimer if set
   - Clear expiryTimer if set
   - Remove visibilitychange listener
   - Call transport.abort()
   - Call removeAllListeners()

7. Visibility handling:
   - Add visibilitychange listener in startPolling
   - On visibility change to 'hidden': clear pollTimer (pause)
   - On visibility change to 'visible': immediately poll once, then resume schedule
   - Store the bound listener reference so destroy() can remove it

Export FlashQueue from `packages/browser-sdk/src/index.ts` along with all types.

Verify the build works.
```
```

---

## Prompt S4 — React hook

```
Create the React hook for the browser SDK at `packages/browser-sdk/src/react.ts`.

This hook wraps FlashQueue for React components, handling lifecycle (destroy on unmount) and exposing state as React state.

```ts
import { useState, useEffect, useCallback, useRef } from 'react';
import { FlashQueue } from './flash-queue';
import type {
  FlashQueueOptions,
  QueueState,
  ErrorPayload,
} from './types';

export interface UseFlashQueueOptions extends FlashQueueOptions {
  autoJoin?: boolean;  // default false — if true, join on mount
}

export interface UseFlashQueueReturn {
  status: QueueState;
  position: number | null;
  estimatedWaitMs: number | null;
  token: string | null;
  error: ErrorPayload | null;
  ticketExpiring: boolean;
  join: () => void;
  destroy: () => void;
}

export function useFlashQueue(options: UseFlashQueueOptions): UseFlashQueueReturn {
  // Implementation:
  // 1. Store FlashQueue instance in a ref (not state — it's mutable)
  // 2. State: status, position, estimatedWaitMs, token, error, ticketExpiring
  // 3. On mount: create FlashQueue instance, attach all listeners that update state
  // 4. If autoJoin is true, call queue.join() on mount
  // 5. On unmount: call queue.destroy()
  // 6. join callback: call queue.join() (memoized with useCallback)
  // 7. destroy callback: call queue.destroy() and reset all state to initial values
  // 8. If publicKey or userId changes: destroy old instance, create new one
  //    - Use a ref to track previous publicKey + userId
  //    - Compare in useEffect, if changed: destroy + recreate
}
```

Key details:
- The hook must NOT recreate the FlashQueue on every render. Store in useRef.
- Event listeners update React state via setState calls.
- The `join` function should be stable across renders (useCallback with ref dependency).
- Handle the edge case where component unmounts WHILE join() is in-flight — the destroy() will abort the transport, and the state updates from event listeners won't fire because the component is unmounted.
- Do NOT wrap in try/catch — errors come through the 'error' event, not thrown exceptions.
- The `ticketExpiring` boolean flips to true when the 'ticket_expiring' event fires. Resets on destroy.

Export `useFlashQueue` and `UseFlashQueueOptions` and `UseFlashQueueReturn` from `packages/browser-sdk/src/react.ts`.

Verify the build produces both `dist/index.mjs` and `dist/react.mjs` with correct types.
```

---
```

## Prompt S5 — UMD build for script tag usage

```
Add a UMD build to the browser SDK so it can be used via a <script> tag without a bundler.

1. Update `packages/browser-sdk/tsup.config.ts`:
   - Add a third entry specifically for UMD: create `packages/browser-sdk/src/umd.ts` that exports everything from index.ts but NOT the React hook
   - Add format "iife" for the umd entry only
   - Set globalName to "FlashEngine" for the iife build
   - Output to `dist/flash-queue.global.js`

2. Create `packages/browser-sdk/src/umd.ts`:
```ts
export { FlashQueue } from './flash-queue';
export type * from './types';
```

3. Update tsup.config.ts to have two build configs:
   - Config 1: entry ['src/index.ts', 'src/react.ts'], format ['esm', 'cjs'], dts true
   - Config 2: entry { 'flash-queue.global': 'src/umd.ts' }, format ['iife'], globalName 'FlashEngine', dts false, minify true

4. Update package.json:
   - Add "unpkg": "dist/flash-queue.global.js"
   - Add "cdn": "dist/flash-queue.global.js"

5. Create `packages/browser-sdk/README.md` with:
   - Installation: npm/yarn/pnpm
   - Quick start with ESM import
   - Quick start with script tag:
     ```html
     <script src="https://unpkg.com/@flashengine/browser/dist/flash-queue.global.js"></script>
     <script>
       const queue = new FlashEngine.FlashQueue({
         publicKey: 'your-public-key',
         userId: 'user-123',
       });
       queue.on('won', ({ token }) => { ... });
       queue.join();
     </script>
     ```
   - React hook usage example
   - Event reference table (event name, payload type, description)
   - API reference for FlashQueue constructor options

Build and verify all three outputs exist: dist/index.mjs, dist/react.mjs, dist/flash-queue.global.js
```
```

---

## Prompt S6 — SDK tests

```
Add tests for the browser SDK at `packages/browser-sdk/`.

Install vitest as a devDependency. Add a test script to package.json: "test": "vitest run".

Create `packages/browser-sdk/vitest.config.ts`:
- environment: 'jsdom' (for document.visibilityState and fetch)
- globals: true

Create `packages/browser-sdk/src/__tests__/flash-queue.test.ts`:

Test cases to implement:

1. **Constructor tests:**
   - Creates instance with required options
   - Applies default apiUrl when not provided
   - Applies default pollIntervalMs when not provided

2. **join() — WON response:**
   - Mock fetch to return { status: 'WON', token: 'jwt.token.here' }
   - Call queue.join()
   - Assert 'won' event fires with token
   - Assert queue.currentState is 'won'

3. **join() — QUEUED then WON:**
   - First fetch (join): return { status: 'QUEUED', position: 5, pollIntervalMs: 100 }
   - Second fetch (status): return { status: 'WON', token: 'jwt.token.here' }
   - Assert 'queued' fires first with position 5
   - Assert 'won' fires after polling
   - Use vi.useFakeTimers() to control setTimeout

4. **join() — QUEUED then SOLD_OUT:**
   - First fetch: QUEUED
   - Second fetch: SOLD_OUT
   - Assert 'queued' fires, then 'sold_out' fires

5. **join() — SOLD_OUT immediate:**
   - fetch returns SOLD_OUT
   - Assert 'sold_out' fires, state is 'sold_out'

6. **join() — PAUSED:**
   - fetch returns { status: 'PAUSED', retryAfter: 1 }
   - Assert 'paused' fires
   - Advance timers by 1 second
   - Assert join is retried (second fetch call)

7. **join() — network error with retry:**
   - First 2 fetch calls throw TypeError (network error)
   - Third fetch returns WON
   - Assert 'won' fires (transport retried internally)

8. **join() — ALREADY_JOINED:**
   - fetch returns ALREADY_JOINED
   - Assert polling starts (second fetch is to status endpoint)

9. **destroy() stops polling:**
   - fetch returns QUEUED
   - Call join(), then destroy()
   - Advance timers significantly
   - Assert no more fetch calls after destroy

10. **double join() throws:**
    - Call join()
    - Call join() again before first resolves
    - Assert second call throws 'Already joined'

11. **poll timeout:**
    - Set maxPollRetries to 2
    - All status polls return QUEUED
    - Assert 'error' event fires with code 'POLL_TIMEOUT' after 2 polls

12. **position event on each poll:**
    - QUEUED with position 10, then position 7, then position 3, then WON
    - Assert 'position' event fires with correct position on each poll

Mock fetch globally using vi.stubGlobal('fetch', vi.fn(...)). Create a helper to set up sequential mock responses. Use vi.useFakeTimers() and vi.advanceTimersByTime() for polling and retry tests.

For the info endpoint mock: always return { status: 'ACTIVE', queueLength: 10, rateLimit: 50, estimatedWaitMs: 200 } unless the test specifically needs different values.

Run the tests and fix any failures.
```

---

# SECTION S (continued) — SERVER SDK

---

## Prompt S7 — Server SDK scaffolding and types

```
Create the server SDK package at `packages/server-sdk/`. This runs on the client's backend server (Node.js) and handles token verification and ticket release.

1. Initialize the package:
   - `packages/server-sdk/package.json`:
     - name: "@flashengine/server"
     - version: "0.1.0"
     - main: "dist/index.cjs"
     - module: "dist/index.mjs"
     - types: "dist/index.d.ts"
     - exports: "." → { import, require, types }
     - files: ["dist"]
     - engines: { "node": ">=18.0.0" }
     - devDependencies: tsup, typescript
     - NO runtime dependencies — use Node built-in crypto and fetch
   - `packages/server-sdk/tsconfig.json`:
     - target: ES2022
     - module: ES2022
     - moduleResolution: bundler
     - strict: true
     - declaration: true
     - outDir: dist
   - `packages/server-sdk/tsup.config.ts`:
     - entry: ["src/index.ts"]
     - format: ["esm", "cjs"]
     - dts: true
     - clean: true
     - minify: true

2. Create `packages/server-sdk/src/types.ts`:

```ts
export interface FlashEngineOptions {
  publicKey: string;
  signingSecret: string;
  apiUrl?: string;               // defaults to 'https://api.flashengine.dev'
  rsaPublicKey?: string;         // PEM string — for offline verification
  jwksCache?: boolean;           // default true — auto-fetch and cache JWKS
  requestTimeoutMs?: number;     // default 10000
}

export interface VerifyResult {
  valid: true;
  userId: string;
  eventId: string;
  jti: string;
  test?: boolean;               // true if test mode token
}

export interface ReleaseResult {
  released: true;
  stockRestored: number;
}

export type ReleaseReason = 'EXPIRED' | 'CANCELLED' | 'PAYMENT_FAILED';

export interface OfflineVerifyResult {
  userId: string;
  publicKey: string;
  eventId: string;
  jti: string;
  expiresAt: number;
  test?: boolean;
}

export class FlashEngineError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode?: number,
  ) {
    super(message);
    this.name = 'FlashEngineError';
  }
}
```

3. Create stub `packages/server-sdk/src/index.ts` that re-exports types.

4. Verify build works.
```
```

---

## Prompt S8 — HMAC signing module

```
Create the HMAC signing module at `packages/server-sdk/src/hmac.ts`.

This module constructs the HMAC signature that the gateway's release route expects. The construction must match EXACTLY what the engine verifies — any mismatch means 401.

Refer to the release route spec:
- The body is JSON-stringified: { jti, reason }
- The timestamp is Date.now().toString()
- The message is: `${timestamp}.${body}`
- The HMAC is: crypto.createHmac('sha256', signingSecret).update(message).digest('hex')
- Headers: x-signature: `sha256=${signature}`, x-timestamp: `${timestamp}`

```ts
import { createHmac } from 'node:crypto';

export interface HmacHeaders {
  'x-signature': string;
  'x-timestamp': string;
  'x-public-key': string;
}

export function signRequest(
  body: object,
  signingSecret: string,
  publicKey: string,
): { headers: HmacHeaders; serializedBody: string } {
  const serializedBody = JSON.stringify(body);
  const timestamp = Date.now().toString();
  const message = `${timestamp}.${serializedBody}`;
  const signature = createHmac('sha256', signingSecret)
    .update(message)
    .digest('hex');

  return {
    headers: {
      'x-signature': `sha256=${signature}`,
      'x-timestamp': timestamp,
      'x-public-key': publicKey,
    },
    serializedBody,
  };
}
```

This is intentionally simple — no class, just a pure function. The critical thing is that the body is JSON.stringify'd ONCE and that exact string is used both for HMAC input and as the request body. If you stringify twice, field order might differ and HMAC will fail.
```
```

---

## Prompt S9 — JWKS fetching and offline verification

```
Create the JWKS module at `packages/server-sdk/src/jwks.ts`.

This module fetches the RSA public key from the gateway's JWKS endpoint and uses it for offline JWT verification (no API call to /verify needed).

```ts
import { createPublicKey, createVerify } from 'node:crypto';

interface JWK {
  kty: string;
  use: string;
  alg: string;
  kid: string;
  n: string;    // base64url modulus
  e: string;    // base64url exponent
}

export class JwksClient {
  private apiUrl: string;
  private cachedKey: { pem: string; fetchedAt: number } | null = null;
  private cacheMaxAgeMs = 3600000; // 1 hour

  constructor(apiUrl: string) {
    this.apiUrl = apiUrl;
  }

  async getPublicKey(eventPublicKey: string): Promise<string> {
    // 1. If cached and not expired, return cached PEM
    // 2. Fetch GET ${apiUrl}/api/.well-known/jwks/${eventPublicKey}
    // 3. Parse response as { keys: JWK[] }
    // 4. Find key with kid === eventPublicKey
    // 5. Convert JWK to PEM using crypto.createPublicKey({ key: jwk, format: 'jwk' })
    // 6. Cache and return the PEM string
    // On error: throw FlashEngineError with code 'JWKS_FETCH_FAILED'
  }

  clearCache(): void {
    this.cachedKey = null;
  }
}
```

Also create a JWT decode + verify function that does NOT use any JWT library — use Node's built-in crypto:

```ts
export function verifyRS256(token: string, publicKeyPem: string): Record<string, unknown> {
  // 1. Split token into header.payload.signature
  // 2. Base64url-decode header, verify alg is RS256
  // 3. Base64url-decode payload, parse as JSON
  // 4. Check exp claim: if exp * 1000 < Date.now(), throw FlashEngineError('Token expired', 'TOKEN_EXPIRED')
  // 5. Verify signature:
  //    - Create verify with 'RSA-SHA256'
  //    - Update with `${headerB64}.${payloadB64}` (the raw base64url segments, NOT decoded)
  //    - Verify against base64url-decoded signature bytes
  // 6. Return parsed payload
}
```

Helper for base64url decoding:
```ts
function base64urlDecode(str: string): Buffer {
  const padded = str + '='.repeat((4 - str.length % 4) % 4);
  return Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}
```

No JWT library needed. The verification is 15 lines of crypto.createVerify.
```
```

---

## Prompt S10 — FlashEngine main class and README

```
Create the main FlashEngine class at `packages/server-sdk/src/flash-engine.ts`.

```ts
import { signRequest } from './hmac';
import { JwksClient, verifyRS256 } from './jwks';
import type {
  FlashEngineOptions,
  VerifyResult,
  ReleaseResult,
  ReleaseReason,
  OfflineVerifyResult,
} from './types';
import { FlashEngineError } from './types';

export class FlashEngine {
  private options: Required<Omit<FlashEngineOptions, 'rsaPublicKey'>> & { rsaPublicKey?: string };
  private jwksClient: JwksClient;

  constructor(options: FlashEngineOptions) {
    // Apply defaults:
    // apiUrl: 'https://api.flashengine.dev'
    // jwksCache: true
    // requestTimeoutMs: 10000
    this.jwksClient = new JwksClient(this.options.apiUrl);
  }

  /**
   * Verify a purchase token via the API.
   * This is the primary verification method — it checks the signature AND prevents double-spend.
   */
  async verifyToken(token: string): Promise<VerifyResult> {
    // 1. POST to ${apiUrl}/api/queue/verify
    // 2. Headers: Content-Type: application/json, x-public-key: this.options.publicKey
    // 3. Body: { token }
    // 4. Timeout: requestTimeoutMs via AbortSignal.timeout()
    // 5. Handle responses:
    //    - 200: return { valid: true, userId, eventId, jti }
    //    - 400 (pk mismatch): throw FlashEngineError('Public key mismatch', 'PK_MISMATCH', 400)
    //    - 401 (invalid signature): throw FlashEngineError('Invalid token', 'INVALID_TOKEN', 401)
    //    - 409 (already used): throw FlashEngineError('Token already used', 'TOKEN_USED', 409)
    //    - Other: throw FlashEngineError with response message
  }

  /**
   * Release a ticket back to the pool.
   * Constructs HMAC signature automatically — the caller never touches crypto.
   */
  async releaseTicket(jti: string, reason: ReleaseReason): Promise<ReleaseResult> {
    // 1. Construct body: { jti, reason }
    // 2. Call signRequest(body, signingSecret, publicKey)
    // 3. POST to ${apiUrl}/api/queue/release
    // 4. Set all headers from signRequest result + Content-Type
    // 5. Use serializedBody from signRequest as the request body (NOT re-stringify)
    // 6. Handle responses:
    //    - 200: return { released: true, stockRestored }
    //    - 401: throw FlashEngineError('HMAC verification failed', 'HMAC_FAILED', 401)
    //    - 404: throw FlashEngineError('Ticket not found', 'TICKET_NOT_FOUND', 404)
    //    - 409: throw FlashEngineError('Already released', 'ALREADY_RELEASED', 409)
    //    - Other: throw with response message
  }

  /**
   * Verify a token offline using the RSA public key (from options or JWKS).
   * Does NOT prevent double-spend — use verifyToken() before charging.
   * Use this for lightweight checks (show checkout page, pre-validate).
   */
  async verifyTokenOffline(token: string): Promise<OfflineVerifyResult> {
    // 1. Get RSA public key:
    //    - If this.options.rsaPublicKey is set, use it directly
    //    - Else: await this.jwksClient.getPublicKey(this.options.publicKey)
    // 2. Call verifyRS256(token, pem)
    // 3. Extract and return: userId (from sub), publicKey (from pk), eventId (from eid), jti, expiresAt (from exp)
  }
}
```

Export from `packages/server-sdk/src/index.ts`:
```ts
export { FlashEngine } from './flash-engine';
export { FlashEngineError } from './types';
export type { FlashEngineOptions, VerifyResult, ReleaseResult, ReleaseReason, OfflineVerifyResult } from './types';
```

Create `packages/server-sdk/README.md` with:
- Installation
- Quick start: create instance, verify token, release ticket
- Offline verification explanation (when to use vs online verify)
- HMAC explanation: "The SDK handles all HMAC signing internally. You never need to construct signatures manually."
- For non-Node.js clients: link to docs page (will be created later) with raw HTTP examples
- Error handling patterns: try/catch with FlashEngineError, checking error.code
- TypeScript types reference

Build and verify.
```
```

---

# SECTION S (continued) — GATEWAY ENDPOINT

---

## Prompt S11 — Queue info endpoint on the gateway

```
Add a new public endpoint to the engine-gateway that the browser SDK uses to show estimated wait times BEFORE the user joins.

1. Add to `apps/engine-gateway/src/controllers/queue.controller.ts`:

```ts
export async function getQueueInfo(req: Request, res: Response) {
  const { pk } = req.query;
  if (!pk || typeof pk !== 'string') {
    return res.status(400).json({ error: 'Missing pk query parameter' });
  }

  try {
    // All from Redis — zero Postgres queries
    const eventData = await redis.hmget(
      `flash:event:${pk}`,
      'status', 'stock', 'rateLimit'
    );

    const [status, stock, rateLimit] = eventData;

    if (!status) {
      return res.status(404).json({ error: 'EVENT_NOT_FOUND' });
    }

    const queueLength = await redis.zcard(`flash:queue:${pk}`);
    const rateLimitNum = parseInt(rateLimit || '50', 10);
    const estimatedWaitMs = rateLimitNum > 0
      ? Math.round(queueLength * (1000 / rateLimitNum))
      : 0;

    return res.json({
      status,
      queueLength,
      rateLimit: rateLimitNum,
      stockRemaining: parseInt(stock || '0', 10),
      estimatedWaitMs,
    });
  } catch (err) {
    console.error('getQueueInfo error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
```

2. Add route to `apps/engine-gateway/src/routes/queue.routes.ts`:
   - GET /api/queue/info — no auth, apply queueStatusLimiter (3 req / 2s per IP — same as status endpoint)
   - Wire to getQueueInfo controller

3. This endpoint returns NO sensitive data (no keys, no user IDs) and is rate limited. It's safe to be public.

Test with curl: `curl http://localhost:3000/api/queue/info?pk=test-key` — should return 404 for nonexistent event.
```
```

---

# SECTION D — DASHBOARD DOCS

---

## Prompt D1 — Docs routing and layout

```
IMPORTANT: Read /mnt/skills/public/frontend-design/SKILL.md before writing any code.

Convert the docs placeholder page into a full docs section with its own nested layout and routing.

1. Create `src/app/dashboard/docs/layout.tsx`:
   - This layout adds a secondary sidebar (docs nav) INSIDE the main dashboard content area
   - Left: docs navigation panel, 220px wide, border-right at border-subtle
   - Right: docs content area, takes remaining space, max-width 720px, padding 32px
   - The docs nav should be a vertical list of links, grouped by section:

   **Getting Started**
   - Overview → /dashboard/docs
   - Quick Start → /dashboard/docs/quick-start

   **Client SDK**
   - Browser SDK → /dashboard/docs/browser-sdk
   - Server SDK → /dashboard/docs/server-sdk

   **Reference**
   - API Reference → /dashboard/docs/api-reference
   - Webhooks → /dashboard/docs/webhooks

   **Guides**
   - Security Model → /dashboard/docs/security
   - Troubleshooting → /dashboard/docs/troubleshooting

   - Section headers: text-xs uppercase tracking-wider text-muted, margin-top between groups
   - Links: text-sm, text-secondary default, text-primary + bg accent-muted on active (match current pathname)
   - Padding: each link has py-1.5 px-3, rounded
   - On mobile (below md breakpoint): collapse the docs nav into a dropdown/select at the top of the page

2. Update the main `src/app/dashboard/docs/page.tsx` (this becomes the Overview page):
   - Remove the placeholder "coming soon" text
   - Show a welcome section:
     - Title: "FlashEngine Documentation"
     - Brief paragraph: "Learn how to integrate FlashEngine into your e-commerce store to protect your database during flash sales and ensure fair ordering for your customers."
   - Quick links grid (2 columns on md): link to each main doc section with icon + title + one-line description
   - At the bottom: "Need help? Contact support at support@flashengine.dev" (muted text)

3. Create stub pages for each route — each is just a page.tsx with the PageHeader component and placeholder text "Content coming soon." We'll fill them in subsequent prompts:
   - src/app/dashboard/docs/quick-start/page.tsx
   - src/app/dashboard/docs/browser-sdk/page.tsx
   - src/app/dashboard/docs/server-sdk/page.tsx
   - src/app/dashboard/docs/api-reference/page.tsx
   - src/app/dashboard/docs/webhooks/page.tsx
   - src/app/dashboard/docs/security/page.tsx
   - src/app/dashboard/docs/troubleshooting/page.tsx

Match the existing dashboard visual language — same dark theme, same typography scale, same border and spacing patterns. The docs content area should feel like a clean reading experience.
```

---

## Prompt D2 — Docs prose component

```
IMPORTANT: Read /mnt/skills/public/frontend-design/SKILL.md before writing any code.

Create a reusable prose/markdown rendering component for the docs pages.

1. Create `src/components/docs/prose.tsx`:
   - A wrapper component that applies typography styles to its children
   - Tailwind prose-like styling but custom (don't import @tailwindcss/typography):
     - h2: text-xl font-semibold text-primary mt-10 mb-4, with a 2px bottom border at border-subtle, pb-2
     - h3: text-lg font-medium text-primary mt-8 mb-3
     - p: text-sm text-secondary leading-relaxed mb-4
     - ul/ol: text-sm text-secondary, ml-6, mb-4, li has mb-1.5
     - code (inline): bg-surface px-1.5 py-0.5 rounded text-xs font-mono text-accent-green
     - a: text-accent-green hover:underline
     - strong: text-primary font-medium
     - hr: border-border-subtle my-8
   - Apply these via CSS classes on a wrapping div, targeting child elements with `& h2`, `& p`, etc. (use a CSS module or styled-jsx or just a utility class with Tailwind's @apply in globals)

2. Create `src/components/docs/code-block.tsx`:
   - Props: code (string), language (string, optional), title (string, optional)
   - Dark background (#0d0d0d), rounded-lg, border at border-subtle
   - If title provided: show it in a top bar (bg slightly different, px-4 py-2, text-xs text-muted, bottom border)
   - Code content: px-4 py-3, font-mono text-xs, overflow-x-auto, white-space pre
   - Copy button in top-right corner (absolute positioned): clipboard icon, copies code to clipboard, shows "Copied!" feedback
   - NO syntax highlighting library — just monospace text with the accent green color. Keep it simple.

3. Create `src/components/docs/callout.tsx`:
   - Props: type ('info' | 'warning' | 'danger'), title (optional), children
   - Styled box with left border:
     - info: blue-ish left border, subtle blue bg
     - warning: yellow/amber left border, subtle yellow bg
     - danger: red left border, subtle red bg
   - Icon in top-left based on type (Info, AlertTriangle, AlertCircle from lucide-react)
   - Title in bold if provided, children as content
   - Padding: p-4, text-sm

4. Create `src/components/docs/step.tsx`:
   - For the Quick Start numbered steps
   - Props: number (number), title (string), children
   - Shows the number in a small circle (accent green bg, text-white), title next to it, children below indented
   - Vertical line connecting steps (via CSS ::before on the container)

These components will be used across all doc pages. Keep them minimal and consistent with the dashboard design.
```

---

## Prompt D3 — Quick Start page

```
IMPORTANT: Read /mnt/skills/public/frontend-design/SKILL.md before writing any code.

Populate the Quick Start docs page at `src/app/dashboard/docs/quick-start/page.tsx`.

This is the most important documentation page — it takes a client from "I just signed up" to "my flash sale queue is working" in 5 minutes.

Use the Prose wrapper, CodeBlock, Callout, and Step components from the docs components.

Content (render all of this as JSX using the doc components — NOT as markdown):

**Title:** "Quick Start Guide"
**Subtitle:** "Integrate FlashEngine with your store in 5 minutes"

**Step 1: Create a Flash Sale Event**
- Go to your Events page and click "New Event"
- Fill in: name, stock count (how many items), rate limit (how many winners per second your checkout can handle)
- Click Create — your event starts in PENDING status

**Step 2: Copy Your Integration Keys**
- On the event detail page, copy three things:
  - **Public Key** — identifies your event (safe for frontend code)
  - **Signing Secret** — for your backend server (NEVER put in frontend code)
  - **RSA Public Key** — for offline token verification (optional)

Callout (warning): "Your Signing Secret is shown once. Store it securely in your environment variables."

**Step 3: Install the SDKs**
CodeBlock:
```bash
# On your storefront (frontend)
npm install @flashengine/browser

# On your payment server (backend)
npm install @flashengine/server
```

**Step 4: Add the Queue to Your Product Page**
CodeBlock (title: "storefront.tsx"):
```tsx
import { FlashQueue } from '@flashengine/browser';

const queue = new FlashQueue({
  publicKey: 'YOUR_PUBLIC_KEY',
  userId: getCurrentUserId(),  // your user's ID
});

queue.on('queued', ({ position, estimatedWaitMs }) => {
  showQueueUI(position);  // "You're #12 in line (~24 seconds)"
});

queue.on('won', ({ token }) => {
  // User won! Redirect to your checkout with the token
  window.location.href = `/checkout?token=${token}`;
});

queue.on('sold_out', () => {
  showSoldOutMessage();
});

queue.join();
```

Callout (info): "Using React? Use the useFlashQueue hook instead — see Browser SDK docs."

**Step 5: Verify Tokens on Your Server**
CodeBlock (title: "checkout-api.ts"):
```ts
import { FlashEngine } from '@flashengine/server';

const engine = new FlashEngine({
  publicKey: 'YOUR_PUBLIC_KEY',
  signingSecret: process.env.FLASH_SIGNING_SECRET!,
});

app.post('/api/checkout', async (req, res) => {
  try {
    const { token } = req.body;
    const result = await engine.verifyToken(token);
    // result.valid === true, result.userId, result.jti
    // Process payment...
  } catch (err) {
    if (err.code === 'TOKEN_USED') {
      return res.status(409).json({ error: 'Token already used' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
});
```

**Step 6: Handle Payment Failures (Release Stock)**
CodeBlock (title: "checkout-api.ts (continued)"):
```ts
// If payment fails, release the ticket back to the pool
await engine.releaseTicket(result.jti, 'PAYMENT_FAILED');
// Stock is automatically restored, next person in queue gets it
```

**Step 7: Activate Your Event**
- Go back to the dashboard and click "Activate" on your event
- The queue is now live — users can join
- Monitor the live stats on the event detail page

Callout (info): "Tip: Use Test Mode (toggle on event creation) to test your integration without affecting real inventory."

**"What's Next?" section at the bottom:**
- Links to Browser SDK docs (full event reference)
- Links to Server SDK docs (release reasons, offline verification)
- Links to Security Model (understand the cryptographic design)

```
```
---

## Prompt D4 — Browser SDK reference page

```
IMPORTANT: Read /mnt/skills/public/frontend-design/SKILL.md before writing any code.

Populate the Browser SDK docs page at `src/app/dashboard/docs/browser-sdk/page.tsx`.

This is the complete API reference for @flashengine/browser. Use the Prose, CodeBlock, and Callout components.

**Title:** "Browser SDK Reference"
**Subtitle:** "@flashengine/browser — Client-side queue integration"

Content sections:

**Installation**
- npm, yarn, pnpm commands in a CodeBlock
- Script tag (CDN) option with the UMD build URL

**FlashQueue**

Constructor options table (render as a styled HTML table, not a component — just a simple <table> with the doc styles):
| Option | Type | Default | Description |
| publicKey | string | required | Your event's public key |
| userId | string | required | Your user's unique identifier |
| apiUrl | string | https://api.flashengine.dev | FlashEngine API URL |
| pollIntervalMs | number | 2000 | Polling interval (server may override) |
| maxPollRetries | number | 100 | Max polls before timeout error |
| debug | boolean | false | Log internal state to console |

**Events**

For each event, show the event name, payload type, and a description with a code example:

1. `queued` — User is in the queue
   - Payload: { position: number, estimatedWaitMs: number }
   - Fires once when initially queued

2. `position` — Queue position updated
   - Payload: { position: number, estimatedWaitMs: number }
   - Fires on every poll while queued

3. `won` — User won a spot
   - Payload: { token: string, expiresAt: number }
   - Token is a signed JWT, pass it to your checkout

4. `sold_out` — No more stock
   - Payload: (none)

5. `paused` — Sale temporarily paused by admin
   - Payload: { retryAfter: number }
   - SDK automatically retries after retryAfter seconds

6. `ticket_expiring` — Token expiring soon
   - Payload: { token: string, expiresInMs: number }
   - Fires 60 seconds before token expires. Show urgency UI.

7. `error` — Something went wrong
   - Payload: { code: string, message: string }
   - Codes: NETWORK_ERROR, EVENT_NOT_FOUND, EVENT_NOT_ACTIVE, POLL_TIMEOUT, UNKNOWN

**Methods**

- `join()` — Joins the queue. Can only be called once. Returns Promise<void>.
- `destroy()` — Stops polling, aborts in-flight requests, removes all listeners. Call on component unmount.
- `currentState` — Getter returning current state: idle | joining | queued | won | sold_out | paused | error | destroyed

**React Hook: useFlashQueue**

Full example with all return values. Show a complete component:
```tsx
import { useFlashQueue } from '@flashengine/browser/react';

function FlashSaleButton({ eventPublicKey, userId }) {
  const {
    status,        // QueueState
    position,      // number | null
    estimatedWaitMs, // number | null
    token,         // string | null
    error,         // { code, message } | null
    ticketExpiring, // boolean
    join,          // () => void
    destroy,       // () => void
  } = useFlashQueue({
    publicKey: eventPublicKey,
    userId,
    autoJoin: false,
  });

  // ... render based on status
}
```

Callout (info): "The React hook handles destroy() on unmount automatically. You don't need cleanup effects."

**Script Tag Usage**
Show the UMD/global usage pattern for sites without a bundler.

**Advanced: Visibility Handling**
Explain that the SDK automatically pauses polling when the browser tab is hidden and resumes when visible again. This reduces unnecessary load on your event.
```
```

---

## Prompt D5 — Server SDK reference page

```
IMPORTANT: Read /mnt/skills/public/frontend-design/SKILL.md before writing any code.

Populate the Server SDK docs page at `src/app/dashboard/docs/server-sdk/page.tsx`.

**Title:** "Server SDK Reference"
**Subtitle:** "@flashengine/server — Backend token verification and ticket management"

Content:

**Installation**
CodeBlock: npm install @flashengine/server

Callout (warning): "This package runs on your server only. Never bundle it for the browser — it contains your signing secret."

**Initialization**
CodeBlock showing FlashEngine constructor with all options:
| Option | Type | Default | Description |
| publicKey | string | required | Event public key |
| signingSecret | string | required | HMAC signing secret (from dashboard) |
| apiUrl | string | https://api.flashengine.dev | API URL |
| rsaPublicKey | string | undefined | RSA public key PEM for offline verification |
| jwksCache | boolean | true | Cache JWKS responses |
| requestTimeoutMs | number | 10000 | Request timeout in ms |

**verifyToken(token)**
- Purpose: Verify a purchase token AND register it as used (prevents double-spend)
- When to use: At your checkout endpoint, before processing payment
- Returns: { valid: true, userId, eventId, jti }
- Errors: TOKEN_USED (409), INVALID_TOKEN (401), PK_MISMATCH (400)
- CodeBlock example in an Express route

Callout (danger): "Always call verifyToken() before charging the customer. This is the double-spend check. Without it, two tabs could use the same token."

**releaseTicket(jti, reason)**
- Purpose: Return a ticket to the pool when payment fails
- Reasons: 'EXPIRED' | 'CANCELLED' | 'PAYMENT_FAILED'
- Returns: { released: true, stockRestored: 1 }
- The SDK constructs HMAC signatures automatically — you never touch crypto
- CodeBlock example

Callout (info): "After a ticket is released, the next person in the queue automatically receives it. You don't need to manage this."

**verifyTokenOffline(token)**
- Purpose: Lightweight signature check without an API call
- Does NOT prevent double-spend
- Use for: showing the checkout page, pre-validating before the heavy verify call
- The SDK fetches the RSA public key from the JWKS endpoint and caches it automatically
- Or provide rsaPublicKey directly in the constructor to skip the fetch
- Returns: { userId, publicKey, eventId, jti, expiresAt }
- CodeBlock example

**Error Handling**
All methods throw FlashEngineError with code, message, and statusCode properties.
CodeBlock showing try/catch with switch on error.code.

**Non-Node.js Clients**
Section explaining how to make raw HTTP calls for Python, Go, PHP, etc.

Sub-section: "HMAC Signature Construction"
Explain the algorithm step by step:
1. JSON.stringify the body: { jti, reason }
2. Get current timestamp: Date.now().toString()
3. Construct message: `${timestamp}.${bodyString}`
4. Compute HMAC-SHA256 of message using your signingSecret
5. Set headers: x-signature: sha256={hex}, x-timestamp: {timestamp}, x-public-key: {publicKey}

CodeBlocks showing the HMAC construction in:
- Python (using hmac + hashlib)
- Go (using crypto/hmac + crypto/sha256)
- PHP (using hash_hmac)

Each example should be complete and runnable — import statements, the full function, example usage.
```

---

## Prompt D6 — API Reference page

```
IMPORTANT: Read /mnt/skills/public/frontend-design/SKILL.md before writing any code.

Populate the API Reference docs page at `src/app/dashboard/docs/api-reference/page.tsx`.

**Title:** "API Reference"
**Subtitle:** "Raw HTTP endpoints for direct integration without SDKs"

This page documents every public API endpoint with curl examples. Organized by category.

Content:

**Base URL**
`https://api.flashengine.dev` (or your self-hosted URL)

**Queue Endpoints**

For each endpoint, show: Method badge (GET/POST styled differently), URL, description, headers table, request body (if POST), response body, error codes, and a curl example.

1. **POST /api/queue/join**
   - Description: Join a flash sale queue
   - Auth: None (public)
   - Rate limit: 5 requests / 10 seconds per IP
   - Body: { publicKey: string, userId: string }
   - Responses: WON (200 with token), QUEUED (202 with position), SOLD_OUT (200), ALREADY_JOINED (200), PAUSED (503), EVENT_NOT_FOUND (404), EVENT_NOT_ACTIVE (400)
   - Curl example

2. **GET /api/queue/status**
   - Description: Check queue position or result
   - Auth: None (public)
   - Rate limit: 3 requests / 2 seconds per IP
   - Query params: pk (publicKey), userId
   - Responses: WON (with token or tokenExpired), QUEUED (with position), SOLD_OUT, NOT_FOUND
   - Curl example

3. **GET /api/queue/info**
   - Description: Get queue stats (pre-join)
   - Auth: None
   - Query params: pk
   - Response: { status, queueLength, rateLimit, stockRemaining, estimatedWaitMs }
   - Curl example

**Verification Endpoints**

4. **POST /api/queue/verify**
   - Description: Verify and consume a purchase token
   - Auth: None (called by client's backend)
   - Headers: x-public-key
   - Body: { token: string }
   - Responses: 200 (valid), 400 (pk mismatch), 401 (invalid signature), 409 (already used)
   - Curl example

5. **POST /api/queue/release**
   - Description: Release a ticket back to the pool
   - Auth: HMAC signature
   - Headers: x-public-key, x-signature, x-timestamp
   - Body: { jti: string, reason: string }
   - Responses: 200 (released), 401 (HMAC failed), 404 (not found), 409 (already released)
   - Curl example (show how to compute HMAC in bash with openssl)

**JWKS Endpoint**

6. **GET /api/.well-known/jwks/:eventPublicKey**
   - Description: Get RSA public key for offline token verification
   - Response: JWK Set format
   - Curl example

**Purchase Token Format (JWT)**
Show the JWT payload structure: { jti, sub, pk, eid, exp }
Explain each field.

Callout (info): "All queue endpoints (join, status, info) hit Redis only — no database queries. Expected latency is under 5ms."

Style the method badges: GET = blue-ish bg, POST = green bg. Each endpoint section has a subtle top border separator. The curl examples should use the CodeBlock component with the copy button.
```

---

## Prompt D7 — Webhooks page

```
IMPORTANT: Read /mnt/skills/public/frontend-design/SKILL.md before writing any code.

Populate the Webhooks docs page at `src/app/dashboard/docs/webhooks/page.tsx`.

**Title:** "Webhooks"
**Subtitle:** "Receive real-time notifications for event lifecycle changes"

Content:

**Overview**
- FlashEngine sends HTTP POST requests to your webhookUrl when event lifecycle changes happen
- Set the webhookUrl when creating an event in the dashboard
- All webhooks are fire-and-forget — your endpoint should return 200 quickly
- If your endpoint is down, the webhook is lost (retry delivery is on the roadmap)

**Webhook Payload**
All webhooks share a base structure:
CodeBlock:
```json
{
  "event": "activated",
  "eventId": "clxyz...",
  "publicKey": "clxyz...",
  "timestamp": "2024-01-15T10:00:00.000Z"
}
```

**Event Types**

Table and details for each:

1. `activated` — Event went live, queue is accepting users
2. `ended` — Event ended, no more processing
3. `paused` — Event temporarily paused (by super admin)
4. `resumed` — Event resumed after pause
5. `stock_released` — A ticket was released back to the pool
   - Additional fields: { jti: string, reason: string }
   - CodeBlock showing the full payload

**Setting Up Your Endpoint**
- Must accept POST with Content-Type: application/json
- Should return 200 within 5 seconds (timeout)
- Should be idempotent — you may receive duplicate webhooks in future versions

CodeBlock example (Express):
```ts
app.post('/webhooks/flashengine', (req, res) => {
  const { event, eventId, publicKey, timestamp } = req.body;

  switch (event) {
    case 'stock_released':
      const { jti, reason } = req.body;
      console.log(`Ticket ${jti} released: ${reason}`);
      break;
    case 'ended':
      console.log(`Sale ${eventId} ended`);
      break;
  }

  res.status(200).send('OK');
});
```

Callout (warning): "Webhooks are not signed in the current version. Verify the request IP or add your own authentication layer if needed. Signed webhooks are on the roadmap."

**Testing Webhooks**
- Use a tool like ngrok to expose your local server
- Set your webhookUrl to the ngrok URL when creating the event
- Activate/end the event from the dashboard to see webhooks arrive
```
```

---

## Prompt D8 — Security Model and Troubleshooting pages

```
IMPORTANT: Read /mnt/skills/public/frontend-design/SKILL.md before writing any code.

Populate the last two docs pages.

**Page 1: Security Model** at `src/app/dashboard/docs/security/page.tsx`

Title: "Security Model"
Subtitle: "How FlashEngine protects your sale from fraud and abuse"

Content sections:

**Token Security (RS256)**
- Purchase tokens are signed with RSA-SHA256 (RS256), not symmetric HMAC
- Each event gets its own 2048-bit RSA keypair, generated at event creation
- Your server verifies tokens using the PUBLIC key — it never needs the private key
- Even if your server is fully compromised, an attacker cannot forge new purchase tokens
- The private key never leaves the FlashEngine engine

**Double-Spend Prevention**
- Every token has a unique JTI (JWT ID)
- When you call verifyToken(), the JTI is inserted into a database with a PRIMARY KEY constraint
- Two simultaneous verify calls race to INSERT — the loser gets 409 "Token already used"
- No distributed locks needed — the database constraint IS the lock
- Diagram: show two parallel verify calls, one succeeds, one gets 409

**HMAC Release Authentication**
- The release endpoint uses HMAC-SHA256 to authenticate requests
- Your signingSecret is used to sign a message: timestamp + JSON body
- The engine recomputes the HMAC and compares with constant-time comparison (timing-safe)
- Timestamps older than 5 minutes are rejected (replay attack prevention)
- The SDK handles all HMAC construction — you never compute it manually

**Per-Event Key Isolation**
- Each event has its own RSA keypair and signing secret
- Compromise of one event's keys does not affect any other event
- Keys are generated fresh for each event, including duplicated events

**What Goes Where (Key Placement)**
Table:
| Key | Where it goes | Where it NEVER goes |
| Public Key | Frontend code, SDK config | — |
| Signing Secret | Backend env vars only | Frontend code, client-side JS, git repos |
| RSA Public Key | Backend for offline verify | — |
| RSA Private Key | FlashEngine engine only | Your code — you never receive this |

Callout (danger): "Never put your Signing Secret in frontend code. It's used to authenticate release requests — if exposed, anyone can release tickets from your sale."

**Rate Limiting**
- Queue join: 5 requests / 10 seconds per IP
- Queue status: 3 requests / 2 seconds per IP
- Auth endpoints: 10 requests / 15 minutes per IP
- Rate limiters use in-memory storage (not Redis) — they survive Redis failures

---

**Page 2: Troubleshooting** at `src/app/dashboard/docs/troubleshooting/page.tsx`

Title: "Troubleshooting"
Subtitle: "Common issues and how to fix them"

Format: each issue as an h3 heading, then problem description, cause, and fix.

Issues:

1. **"Token already used" (409 from verify)**
   - Cause: You're calling verifyToken() more than once with the same token
   - Fix: Call verify exactly once, then use the result. If you need to re-check, use verifyTokenOffline()

2. **"EVENT_NOT_ACTIVE" from join endpoint**
   - Cause: Your event is in PENDING or ENDED status
   - Fix: Activate your event from the dashboard before going live

3. **"HMAC verification failed" (401 from release)**
   - Cause: The HMAC signature doesn't match. Usually one of:
     - Wrong signingSecret
     - Body was re-serialized between HMAC computation and sending (field order changed)
     - Timestamp drift (your server clock is off)
   - Fix: If using the SDK, ensure you're passing the correct signingSecret. If constructing HMAC manually, use the EXACT same JSON string for both HMAC input and request body. Check your server's clock with `date` command.

4. **CORS errors in the browser**
   - Cause: Your apiUrl doesn't match the engine's CORS configuration
   - Fix: Ensure the engine-gateway has CORS configured for your domain. If self-hosting, add your domain to the CORS allowed origins.

5. **"SOLD_OUT" immediately after activation**
   - Cause: Either stockCount is 0, or queueCap was reached from a previous activation
   - Fix: Check your event's stock count in the dashboard. If you're re-activating after ending, create a new event instead.

6. **Polling stops when tab goes to background**
   - This is intentional — the SDK pauses polling to reduce server load when the tab isn't visible
   - Polling resumes immediately when the user returns to the tab
   - The user's position in the queue is preserved

7. **Token expired before user completed checkout**
   - Tokens have a 15-minute TTL
   - Listen for the 'ticket_expiring' event (fires 60 seconds before expiry) and show urgency UI
   - If expired: call releaseTicket() with reason 'EXPIRED' and let the next person in queue get the slot

8. **"EVENT_NOT_FOUND" despite event existing**
   - Cause: The event exists in Postgres but not in Redis (it was never activated, or Redis was reset)
   - Fix: Activate the event from the dashboard. Activation writes to both Postgres and Redis.

Callout (info) at the bottom: "Still stuck? Check the event's live stats in the dashboard for clues, or contact support@flashengine.dev"
```

---

# SECTION F — ADDITIONAL FEATURES

---

## Prompt F1 — Test Mode for events

```
Add Test Mode to flash sale events. This lets clients test their integration without affecting real inventory.

**Backend changes (engine-gateway):**

1. Add to Prisma schema — add a `mode` field to SaleEvent:
   ```prisma
   mode String @default("LIVE") // LIVE | TEST
   ```
   Run `npx prisma migrate dev --name add-event-mode`.

2. Update `apps/engine-gateway/src/controllers/admin.controller.ts` — `createEvent`:
   - Accept optional `mode` field in the request body (default 'LIVE')
   - Validate mode is either 'LIVE' or 'TEST'
   - Store it in the SaleEvent record

3. Update `apps/engine-gateway/src/controllers/queue.controller.ts` — `joinQueue`:
   - After the Lua script runs, when signing the JWT for a WON result:
     - If the event is in TEST mode (check event cache — add mode to EventEntry interface and cache), add a `test: true` claim to the JWT payload
   - No other behavioral changes — test mode processes the queue identically to live mode

4. Update `apps/engine-gateway/src/controllers/queue.controller.ts` — `verifyToken`:
   - After successful verification, if the JWT payload contains `test: true`:
     - Still insert UsedJti (double-spend check works the same)
     - Return `{ valid: true, userId, eventId, jti, test: true }` — the `test: true` flag tells the client's backend not to process a real payment

5. Update the event cache interface in `event-cache.service.ts`:
   - Add `mode: string` to EventEntry
   - Warm it from Postgres alongside other fields

6. Add a test mode auto-reset: When a TEST mode event is activated, start a separate setInterval (every 5 minutes) that:
   - Resets stock in Redis to the original stockCount: `HSET flash:event:{pk} stock {originalStock}`
   - Clears the result hash: `DEL flash:result:{pk}`
   - Clears the queue: `DEL flash:queue:{pk}`
   - Resets admitted to 0: `HSET flash:event:{pk} admitted 0`
   - This lets the client test repeatedly without re-creating the event
   - Store the timer handle so it's cleared on event end

7. Update `activateEvent` and `endEvent` to handle the test reset timer lifecycle.

**Frontend changes (saas-dashboard):**

8. Update `src/app/dashboard/events/new/page.tsx`:
   - Add a toggle/switch for "Test Mode" below the form fields
   - Label: "Test Mode" with description: "Queue works normally but tokens are marked as test. Stock resets every 5 minutes."
   - The toggle controls the `mode` field sent to the API ('TEST' or 'LIVE')

9. Update the event detail page (`src/app/dashboard/events/[id]/page.tsx`):
   - If event mode is 'TEST', show a prominent banner at the top:
     - Yellow/amber background, text: "TEST MODE — Tokens are marked with test: true. Stock resets every 5 minutes."
   - Show mode badge next to the event status badge

10. Update the events list page to show a small "TEST" badge next to test mode events.
```
```

---

## Prompt F2 — Event Analytics Timeline endpoint

```
Add a timeline analytics endpoint to the engine-gateway that returns time-bucketed event data.

1. Add to `apps/engine-gateway/src/controllers/admin.controller.ts`:

```ts
export async function getEventTimeline(req: AuthenticatedRequest, res: Response) {
  const { id } = req.params;
  const { bucketSize = '10' } = req.query; // seconds per bucket

  // 1. Verify event exists and user has access (same ownership check as getEventStats)
  const event = await prisma.saleEvent.findUnique({ where: { id } });
  if (!event) return res.status(404).json({ error: 'Event not found' });

  // Ownership check for CLIENT role
  if (req.res?.locals.client?.role === 'CLIENT' && event.clientId !== req.res?.locals.client?.id) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const bucketSizeSeconds = parseInt(bucketSize as string, 10) || 10;

  // 2. Raw SQL query for time-bucketed aggregation:
  const buckets = await prisma.$queryRaw`
    SELECT
      date_trunc('second', "createdAt")
        - (EXTRACT(SECOND FROM "createdAt")::int % ${bucketSizeSeconds}) * interval '1 second'
        AS bucket,
      COUNT(*) FILTER (WHERE result = 'WON') AS won,
      COUNT(*) FILTER (WHERE result = 'QUEUED') AS queued,
      COUNT(*) FILTER (WHERE result = 'SOLD_OUT') AS sold_out,
      COUNT(*) FILTER (WHERE result = 'RELEASED') AS released,
      COUNT(*) AS total
    FROM "QueueAttempt"
    WHERE "saleEventId" = ${id}
    GROUP BY bucket
    ORDER BY bucket ASC
  `;

  // 3. Format and return
  const timeline = (buckets as any[]).map(b => ({
    timestamp: b.bucket.toISOString(),
    won: Number(b.won),
    queued: Number(b.queued),
    soldOut: Number(b.sold_out),
    released: Number(b.released),
    total: Number(b.total),
  }));

  return res.json({ timeline, bucketSizeSeconds });
}
```

2. Add route to admin.routes.ts:
   - GET /api/admin/events/:id/timeline — behind requireAdminAuth
   - Query param: bucketSize (optional, default 10)

3. Test with curl against an event that has QueueAttempt records.
```
```

---

## Prompt F3 — Timeline chart on event detail page

```
IMPORTANT: Read /mnt/skills/public/frontend-design/SKILL.md before writing any code.

Add an analytics timeline chart to the event detail page in the dashboard.

1. Create `src/components/events/event-timeline-chart.tsx`:
   - Props: eventId (string), status (string — only fetch if ACTIVE or ENDED)
   - Fetch from GET /api/admin/events/${eventId}/timeline
   - If no data, show a muted message: "Timeline data will appear once the event is activated."

2. Render a line/area chart using Recharts (already available in the project):
   - X axis: timestamp (formatted as HH:MM:SS)
   - Y axis: count
   - Lines/areas for: total (gray), won (green), soldOut (red)
   - Don't show queued or released lines — they clutter the chart. Show them in a legend or tooltip only.
   - Use the green accent color for the won line
   - Tooltip showing all values on hover
   - Responsive container, 100% width, 300px height
   - Dark theme: use the dashboard's color variables for axis text (text-muted), grid lines (border-subtle), tooltip bg (surface)

3. Add the chart to the event detail page:
   - Place it below the stats cards and above the integration keys section
   - Wrap in a Card component with header "Activity Timeline"
   - If event is ACTIVE, auto-refresh the timeline data every 10 seconds
   - If event is ENDED, fetch once and don't refresh

4. For PENDING events, don't render the chart component at all.
```

---

## Prompt F4 — Signing secret rotation

```
Add the ability to rotate an event's signing secret without creating a new event.

**Backend:**

1. Add to `apps/engine-gateway/src/controllers/admin.controller.ts`:

```ts
export async function rotateSigningSecret(req: AuthenticatedRequest, res: Response) {
  const { id } = req.params;

  // 1. Fetch event, verify ownership (same pattern as other admin routes)
  const event = await prisma.saleEvent.findUnique({ where: { id } });
  if (!event) return res.status(404).json({ error: 'Event not found' });

  // CLIENT role: verify ownership
  const client = res.locals.client;
  if (client.role === 'CLIENT' && event.clientId !== client.id) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  // 2. Generate new signing secret
  const newSigningSecret = crypto.randomBytes(32).toString('hex');

  // 3. Update Postgres
  await prisma.saleEvent.update({
    where: { id },
    data: { signingSecret: newSigningSecret },
  });

  // 4. Update in-process cache if event is ACTIVE
  const cached = getEventEntry(event.publicKey);
  if (cached) {
    warmEventCache(event.publicKey, {
      ...cached,
      signingSecret: newSigningSecret,
    });
  }

  // 5. Return new secret (shown once, like initial creation)
  return res.json({
    signingSecret: newSigningSecret,
    message: 'Signing secret rotated. Update your server immediately — the old secret is now invalid.',
  });
}
```

2. Add route to admin.routes.ts:
   - PUT /api/admin/events/:id/rotate-secret — behind requireAdminAuth

**Frontend:**

3. On the event detail page, in the Integration Keys section, add a "Rotate" button next to the Signing Secret field:
   - Button style: small, outlined, yellow/amber color (destructive-ish but not red)
   - On click: show a confirmation modal:
     - Title: "Rotate Signing Secret?"
     - Body: "This will immediately invalidate the current secret. Your backend server will need to be updated with the new secret or release requests will fail."
     - Confirm button: "Rotate Secret"
     - Cancel button: "Cancel"
   - On confirm: call PUT /api/admin/events/:id/rotate-secret
   - On success: show the new secret in the CopyableField (replace the current one), show a toast: "Secret rotated successfully"
```
```

---

## Prompt F5 — Super Admin live monitoring page

```
IMPORTANT: Read /mnt/skills/public/frontend-design/SKILL.md before writing any code.

Create the live event monitoring page for super admins — the "war room" view.

**Backend:**

1. Add to `apps/engine-gateway/src/controllers/superadmin.controller.ts`:

```ts
export async function getLiveEvents(req: Request, res: Response) {
  // 1. Get all ACTIVE events from Postgres with client info
  const activeEvents = await prisma.saleEvent.findMany({
    where: { status: 'ACTIVE' },
    include: { client: { select: { email: true, name: true } } },
  });

  if (activeEvents.length === 0) {
    return res.json({ events: [] });
  }

  // 2. For each event, get live Redis data
  const pipeline = redis.pipeline();
  for (const event of activeEvents) {
    pipeline.hmget(`flash:event:${event.publicKey}`, 'stock', 'admitted', 'rateLimit');
    pipeline.zcard(`flash:queue:${event.publicKey}`);
  }
  const results = await pipeline.exec();

  // 3. Combine
  const live = activeEvents.map((event, i) => {
    const [, hashData] = results![i * 2] as [Error | null, string[]];
    const [, queueDepth] = results![i * 2 + 1] as [Error | null, number];
    const [stock, admitted, rateLimit] = hashData || ['0', '0', '50'];

    return {
      id: event.id,
      name: event.name,
      publicKey: event.publicKey,
      mode: event.mode,
      clientEmail: event.client.email,
      clientName: event.client.name,
      stockTotal: event.stockCount,
      stockRemaining: parseInt(stock || '0', 10),
      admitted: parseInt(admitted || '0', 10),
      queueDepth: queueDepth || 0,
      rateLimit: parseInt(rateLimit || '50', 10),
      activatedAt: event.activatedAt,
    };
  });

  return res.json({ events: live });
}
```

2. Add route to superadmin.routes.ts:
   - GET /api/superadmin/live — behind requireAuth + requireRole('SUPER_ADMIN')

**Frontend:**

3. Add "Live" nav item to the admin sidebar (between "Overview" and "Clients"):
   - Icon: Radio (from lucide-react)
   - Route: /admin/live
   - Add a small green pulsing dot next to the icon to indicate "live"

4. Create `src/app/admin/live/page.tsx`:
   - Page header: "Live Monitoring" with a subtitle showing the count of active events and a pulsing green dot
   - Auto-refresh every 3 seconds (useEffect with setInterval)

5. If no active events: show EmptyState with message "No active events. Events will appear here when activated."

6. If active events exist: show a grid of cards (2 columns on lg, 1 on md):
   Each card shows:
   - Event name (bold) + client email (muted, below)
   - Mode badge if TEST
   - Stock progress bar: stockRemaining / stockTotal
     - Green when > 50% remaining
     - Yellow when 10-50% remaining
     - Red when < 10% remaining
   - Stats row: "Queue: {depth}" | "Admitted: {admitted}" | "Rate: {rateLimit}/s"
   - How long ago it was activated (relative time using the relativeTime util)
   - Health indicator dot:
     - Green: queueDepth < rateLimit * 5 (queue draining faster than growing)
     - Yellow: queueDepth between rateLimit * 5 and rateLimit * 30 (building up)
     - Red: stockRemaining === 0 (sold out, should end soon)
   - Click on card navigates to /admin/events/{id} for detailed view

7. At the top of the page (above the grid), show aggregate stats in a row of small stat-cards:
   - Total Active Events
   - Total Users in Queue (sum of all queueDepths)
   - Total Stock Remaining (sum of all stockRemaining)
   - Total Admitted (sum of all admitted)

Style it to feel urgent and real-time — the auto-refresh and pulsing dots convey "this is live data." Match the existing admin dashboard design language.
```
```

---

# VERIFICATION CHECKLIST

After all prompts are complete, verify:

1. `cd packages/browser-sdk && npm run build` — produces dist/index.mjs, dist/react.mjs, dist/flash-queue.global.js, type declarations
2. `cd packages/browser-sdk && npm test` — all tests pass
3. `cd packages/server-sdk && npm run build` — produces dist/index.mjs, dist/index.cjs, type declarations
4. Engine gateway starts without errors, new /api/queue/info endpoint returns data
5. Dashboard docs section renders all pages with proper navigation
6. Test mode toggle appears on event creation form
7. Timeline chart renders on event detail page (needs QueueAttempt data)
8. Secret rotation works from event detail page
9. Super admin live monitoring page shows active events with auto-refresh
