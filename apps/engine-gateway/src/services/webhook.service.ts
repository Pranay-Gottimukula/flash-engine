import redis from './redis.service';

// ── Constants ─────────────────────────────────────────────────────────────────

const RETRY_KEY    = 'flash:webhook:retry';
const MAX_ENTRIES  = 1000;
const MAX_ATTEMPTS = 3;
// nextRetryAt offsets indexed by current attempt count (1-based):
//   attempts=1 → wait 10s before first retry
//   attempts=2 → wait 30s before second retry
//   attempts=3 → wait 120s before third (final) retry; failure → drop
const BACKOFF_MS = [10_000, 30_000, 120_000];

// ── Types ─────────────────────────────────────────────────────────────────────

interface RetryEntry {
  url:         string;
  payload:     Record<string, unknown>;
  attempts:    number;
  nextRetryAt: number; // unix ms
}

// ── Shared fetch helper ───────────────────────────────────────────────────────

function attemptFetch(url: string, payload: Record<string, unknown>): Promise<Response> {
  const ac = new AbortController();
  setTimeout(() => ac.abort(), 5_000);
  return fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    signal:  ac.signal,
    body:    JSON.stringify(payload),
  });
}

// ── Public: fire webhook, enqueue on failure ──────────────────────────────────
//
// Returns void synchronously — never awaited by callers. On network failure or
// 5-second timeout the payload is pushed to flash:webhook:retry so the retry
// worker can redeliver it with exponential backoff.

export function fireWebhook(url: string, payload: Record<string, unknown>): void {
  attemptFetch(url, payload).catch(err => {
    const entry: RetryEntry = {
      url,
      payload,
      attempts:    1,
      nextRetryAt: Date.now() + BACKOFF_MS[0],
    };
    // rpush keeps FIFO order; ltrim drops oldest entries when cap is hit.
    redis.pipeline()
      .rpush(RETRY_KEY, JSON.stringify(entry))
      .ltrim(RETRY_KEY, -MAX_ENTRIES, -1)
      .exec()
      .catch(queueErr => console.error('[webhook] Failed to enqueue retry:', queueErr));

    console.warn(
      '[webhook] Delivery failed, queued for retry:',
      url,
      err instanceof Error ? err.message : err,
    );
  });
}

// ── Retry worker ──────────────────────────────────────────────────────────────
//
// Runs every 5 seconds. Reads the full retry list (capped at 1000), processes
// every entry whose nextRetryAt is in the past, and updates or drops the entry
// in Redis depending on the outcome.
//
// A busy-guard prevents tick overlap if a batch of slow webhooks takes > 5s.

let workerBusy = false;

async function processRetryQueue(): Promise<void> {
  if (workerBusy) return;
  workerBusy = true;

  try {
    const now = Date.now();
    const raw = await redis.lrange(RETRY_KEY, 0, -1);
    if (raw.length === 0) return;

    for (const item of raw) {
      let entry: RetryEntry;
      try {
        entry = JSON.parse(item) as RetryEntry;
      } catch {
        // Malformed entry — remove silently.
        await redis.lrem(RETRY_KEY, 1, item).catch(() => {});
        continue;
      }

      if (entry.nextRetryAt > now) continue; // not due yet

      // Attempt delivery.
      let succeeded = false;
      try {
        await attemptFetch(entry.url, entry.payload);
        succeeded = true;
      } catch {
        // Failure handled below.
      }

      if (succeeded) {
        await redis.lrem(RETRY_KEY, 1, item).catch(() => {});
        continue;
      }

      // Delivery failed.
      if (entry.attempts >= MAX_ATTEMPTS) {
        // Reached the attempt cap — drop and warn.
        await redis.lrem(RETRY_KEY, 1, item).catch(() => {});
        console.warn(
          `[webhook] Dropping after ${entry.attempts} failed attempts: ${entry.url}`,
        );
        continue;
      }

      // Re-queue with incremented attempts and next backoff delay.
      const updated: RetryEntry = {
        ...entry,
        attempts:    entry.attempts + 1,
        nextRetryAt: now + BACKOFF_MS[entry.attempts], // BACKOFF_MS[1]=30s, [2]=120s
      };
      await redis.pipeline()
        .lrem(RETRY_KEY, 1, item)
        .rpush(RETRY_KEY, JSON.stringify(updated))
        .exec()
        .catch(() => {});
    }
  } finally {
    workerBusy = false;
  }
}

// ── Public: start background worker ──────────────────────────────────────────

export function startWebhookRetryWorker(): void {
  setInterval(() => {
    processRetryQueue().catch(err =>
      console.error('[webhook/retry] Worker error:', err),
    );
  }, 5_000);
  console.log('[webhook] Retry worker started (5s interval, max 3 attempts)');
}
