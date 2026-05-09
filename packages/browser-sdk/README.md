# @flashengine/browser

Client-side SDK for [FlashEngine](https://flashengine.dev) — connect your storefront to the queue and handle virtual waiting rooms with a single class or React hook.

## Installation

```bash
npm install @flashengine/browser
# or
yarn add @flashengine/browser
# or
pnpm add @flashengine/browser
```

## Quick start — ESM / bundler

```ts
import { FlashQueue } from '@flashengine/browser';

const queue = new FlashQueue({
  publicKey: 'your-public-key',
  userId: 'user-123',
});

queue.on('queued', ({ position, estimatedWaitMs }) => {
  console.log(`Position ${position}, ~${estimatedWaitMs / 1000}s wait`);
});

queue.on('won', ({ token }) => {
  // Store token and proceed to checkout
  localStorage.setItem('flash_token', token);
  window.location.href = '/checkout';
});

queue.on('error', ({ code, message }) => {
  console.error(code, message);
});

await queue.join();
```

## Quick start — `<script>` tag (no bundler)

```html
<script src="https://unpkg.com/@flashengine/browser/dist/flash-queue.global.js"></script>
<script>
  const queue = new FlashEngine.FlashQueue({
    publicKey: 'your-public-key',
    userId: 'user-123',
  });

  queue.on('won', ({ token }) => {
    localStorage.setItem('flash_token', token);
    window.location.href = '/checkout';
  });

  queue.on('error', ({ code, message }) => {
    console.error(code, message);
  });

  queue.join();
</script>
```

## React hook

```tsx
import { useFlashQueue } from '@flashengine/browser/react';

function WaitingRoom() {
  const { status, position, estimatedWaitMs, token, error, ticketExpiring, join } =
    useFlashQueue({
      publicKey: 'your-public-key',
      userId: 'user-123',
      autoJoin: true,
    });

  if (status === 'queued') {
    return (
      <p>
        Position {position} — about {Math.round((estimatedWaitMs ?? 0) / 1000)}s remaining
      </p>
    );
  }

  if (status === 'won') {
    return <p>You're in! Token: {token}</p>;
  }

  if (status === 'error') {
    return <p>Error: {error?.message}</p>;
  }

  return <button onClick={join}>Join queue</button>;
}
```

## Events

| Event | Payload | Description |
|---|---|---|
| `queued` | `{ position, estimatedWaitMs }` | You joined and are waiting. Fired once on entry. |
| `position` | `{ position, estimatedWaitMs }` | Position update during polling. |
| `won` | `{ token, expiresAt }` | You reached the front. `token` is a JWT to pass to checkout. |
| `sold_out` | `{}` | Queue closed — no more slots available. |
| `paused` | `{ retryAfter }` | Queue is paused. SDK will auto-retry after `retryAfter` seconds. |
| `ticket_expiring` | `{ token, expiresInMs }` | Fires 60 s before the ticket expires. Prompt the user to act. |
| `error` | `{ code, message }` | See error codes below. Polling continues unless code is `POLL_TIMEOUT`. |

### Error codes

| Code | Meaning |
|---|---|
| `NETWORK_ERROR` | All fetch retries exhausted (3 attempts with exponential backoff). |
| `EVENT_NOT_FOUND` | `publicKey` does not match any active event. |
| `EVENT_NOT_ACTIVE` | Event exists but hasn't started yet. |
| `POLL_TIMEOUT` | `maxPollRetries` exceeded without a terminal status. |
| `UNKNOWN` | Unexpected server error. |

## Constructor options

| Option | Type | Default | Description |
|---|---|---|---|
| `publicKey` | `string` | required | Public key for your FlashEngine event. |
| `userId` | `string` | required | Unique identifier for the end user (hashed on the server). |
| `apiUrl` | `string` | `https://api.flashengine.dev` | Override for self-hosted or staging deployments. |
| `pollIntervalMs` | `number` | `2000` | Base polling interval in ms. Overridden by server response. Jitter of ±500 ms is applied. |
| `maxPollRetries` | `number` | `100` | Maximum poll attempts before emitting a `POLL_TIMEOUT` error (~200 s at 2 s intervals). |
| `debug` | `boolean` | `false` | Log all HTTP requests and state transitions to the console. |
