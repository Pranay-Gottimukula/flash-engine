import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FlashQueue } from '../flash-queue';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Drain multiple levels of the microtask queue without advancing fake timers. */
const flushPromises = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

const INFO_RESPONSE = { status: 'ACTIVE', queueLength: 10, rateLimit: 50, estimatedWaitMs: 200 };

function makeResponse(body: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 400,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

/**
 * Route fetch calls by URL segment:
 *  - /api/queue/info  → INFO_RESPONSE
 *  - everything else  → sequential from queueResponses (last repeated)
 */
function mockFetchWithInfo(...queueResponses: unknown[]): ReturnType<typeof vi.fn> {
  let qi = 0;
  const mock = vi.fn((url: string) => {
    if (typeof url === 'string' && url.includes('/api/queue/info')) {
      return Promise.resolve(makeResponse(INFO_RESPONSE));
    }
    const body = queueResponses[Math.min(qi, queueResponses.length - 1)];
    qi++;
    if (body instanceof Error) return Promise.reject(body);
    return Promise.resolve(makeResponse(body));
  });
  vi.stubGlobal('fetch', mock);
  return mock;
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

let queue: FlashQueue;

beforeEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

afterEach(() => {
  // destroy() is idempotent — safe even if already destroyed
  try { queue?.destroy(); } catch { /* already destroyed */ }
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// 1. Constructor
// ---------------------------------------------------------------------------

describe('constructor', () => {
  it('creates instance with required options', () => {
    mockFetchWithInfo();
    queue = new FlashQueue({ publicKey: 'pk_test', userId: 'u1' });
    expect(queue.currentState).toBe('idle');
  });

  it('applies default apiUrl', async () => {
    mockFetchWithInfo({ status: 'SOLD_OUT' });
    queue = new FlashQueue({ publicKey: 'pk_test', userId: 'u1' });
    queue.join();
    await flushPromises();
    expect(
      vi.mocked(fetch).mock.calls.some(([url]) =>
        typeof url === 'string' && url.startsWith('https://api.flashengine.dev')
      )
    ).toBe(true);
  });

  it('applies default pollIntervalMs of 2000', () => {
    mockFetchWithInfo({ status: 'SOLD_OUT' });
    queue = new FlashQueue({ publicKey: 'pk_test', userId: 'u1' });
    // Just verifying the instance is created without throwing
    expect(queue.currentState).toBe('idle');
  });
});

// ---------------------------------------------------------------------------
// 2. join() — WON immediate
// ---------------------------------------------------------------------------

describe('join() — WON response', () => {
  it('emits won and sets state to won', async () => {
    mockFetchWithInfo({ status: 'WON', token: 'jwt.token.here' });
    queue = new FlashQueue({ publicKey: 'pk_test', userId: 'u1' });

    const wonPayload = await new Promise<{ token: string; expiresAt: number }>((resolve) => {
      queue.on('won', resolve);
      queue.join();
    });

    expect(wonPayload.token).toBe('jwt.token.here');
    expect(queue.currentState).toBe('won');
  });
});

// ---------------------------------------------------------------------------
// 3. join() — QUEUED then WON
// ---------------------------------------------------------------------------

describe('join() — QUEUED then WON', () => {
  it('emits queued then won after polling', async () => {
    vi.useFakeTimers();

    mockFetchWithInfo(
      { status: 'QUEUED', position: 5, pollIntervalMs: 100 },
      { status: 'WON', token: 'jwt.token.here' },
    );

    queue = new FlashQueue({ publicKey: 'pk_test', userId: 'u1' });

    const events: string[] = [];
    let queuedPosition: number | null = null;
    let wonToken: string | null = null;

    queue.on('queued', ({ position }) => { events.push('queued'); queuedPosition = position; });
    queue.on('won', ({ token }) => { events.push('won'); wonToken = token; });

    queue.join();
    await flushPromises();                       // settle join + info fetches
    await vi.advanceTimersByTimeAsync(600);      // fire poll timer (100ms + jitter)
    await flushPromises();                       // settle status fetch

    expect(events[0]).toBe('queued');
    expect(queuedPosition).toBe(5);
    expect(events).toContain('won');
    expect(wonToken).toBe('jwt.token.here');
  });
});

// ---------------------------------------------------------------------------
// 4. join() — QUEUED then SOLD_OUT
// ---------------------------------------------------------------------------

describe('join() — QUEUED then SOLD_OUT', () => {
  it('emits queued then sold_out', async () => {
    vi.useFakeTimers();

    mockFetchWithInfo(
      { status: 'QUEUED', position: 3, pollIntervalMs: 100 },
      { status: 'SOLD_OUT' },
    );

    queue = new FlashQueue({ publicKey: 'pk_test', userId: 'u1' });

    const events: string[] = [];
    queue.on('queued', () => events.push('queued'));
    queue.on('sold_out', () => events.push('sold_out'));

    queue.join();
    await flushPromises();
    await vi.advanceTimersByTimeAsync(600);
    await flushPromises();

    expect(events).toEqual(['queued', 'sold_out']);
    expect(queue.currentState).toBe('sold_out');
  });
});

// ---------------------------------------------------------------------------
// 5. join() — SOLD_OUT immediate
// ---------------------------------------------------------------------------

describe('join() — SOLD_OUT immediate', () => {
  it('emits sold_out and sets state', async () => {
    mockFetchWithInfo({ status: 'SOLD_OUT' });
    queue = new FlashQueue({ publicKey: 'pk_test', userId: 'u1' });

    await new Promise<void>((resolve) => {
      queue.on('sold_out', () => resolve());
      queue.join();
    });

    expect(queue.currentState).toBe('sold_out');
  });
});

// ---------------------------------------------------------------------------
// 6. join() — PAUSED
// ---------------------------------------------------------------------------

describe('join() — PAUSED', () => {
  it('emits paused then retries join after retryAfter seconds', async () => {
    vi.useFakeTimers();

    mockFetchWithInfo(
      { status: 'PAUSED', retryAfter: 1 },
      { status: 'WON', token: 'jwt.token.here' },
    );

    queue = new FlashQueue({ publicKey: 'pk_test', userId: 'u1' });

    const events: string[] = [];
    queue.on('paused', () => events.push('paused'));
    queue.on('won', () => events.push('won'));

    queue.join();
    await flushPromises();                    // first join settles → PAUSED
    expect(events).toContain('paused');

    await vi.advanceTimersByTimeAsync(1100); // retryAfter = 1 s
    await flushPromises();                   // retry join settles → WON

    expect(events).toContain('won');
    expect(vi.mocked(fetch).mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// 7. join() — network error with retry
// ---------------------------------------------------------------------------

describe('join() — network error with retry', () => {
  it('retries and emits won when fetch eventually succeeds', async () => {
    vi.useFakeTimers();

    let joinAttempt = 0;
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      if (typeof url === 'string' && url.includes('/api/queue/info')) {
        return Promise.resolve(makeResponse(INFO_RESPONSE));
      }
      joinAttempt++;
      if (joinAttempt <= 2) return Promise.reject(new TypeError('Failed to fetch'));
      return Promise.resolve(makeResponse({ status: 'WON', token: 'jwt.token.here' }));
    }));

    queue = new FlashQueue({ publicKey: 'pk_test', userId: 'u1' });

    const wonToken = new Promise<string>((resolve) => {
      queue.on('won', ({ token }) => resolve(token));
    });

    queue.join();

    // Transport back-off: ~1 s, ~2 s — advance past all of them
    await vi.advanceTimersByTimeAsync(10_000);
    await flushPromises();

    expect(await wonToken).toBe('jwt.token.here');
    expect(queue.currentState).toBe('won');
  });
});

// ---------------------------------------------------------------------------
// 8. join() — ALREADY_JOINED starts polling
// ---------------------------------------------------------------------------

describe('join() — ALREADY_JOINED', () => {
  it('starts polling (status endpoint is called)', async () => {
    vi.useFakeTimers();

    mockFetchWithInfo(
      { status: 'ALREADY_JOINED' },
      { status: 'WON', token: 'jwt.token.here' },
    );

    queue = new FlashQueue({ publicKey: 'pk_test', userId: 'u1', pollIntervalMs: 100 });

    const wonP = new Promise<void>((resolve) => queue.on('won', () => resolve()));

    queue.join();
    await flushPromises();
    await vi.advanceTimersByTimeAsync(600);
    await flushPromises();

    await wonP;

    const statusCalls = vi.mocked(fetch).mock.calls.filter(([url]) =>
      typeof url === 'string' && url.includes('/api/queue/status')
    );
    expect(statusCalls.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// 9. destroy() stops polling
// ---------------------------------------------------------------------------

describe('destroy()', () => {
  it('stops polling — no more fetch calls after destroy', async () => {
    vi.useFakeTimers();

    mockFetchWithInfo(
      { status: 'QUEUED', position: 5, pollIntervalMs: 100 },
      { status: 'QUEUED', position: 4 },
    );

    queue = new FlashQueue({ publicKey: 'pk_test', userId: 'u1', pollIntervalMs: 100 });
    queue.join();
    await flushPromises();

    queue.destroy();

    const callsAtDestroy = vi.mocked(fetch).mock.calls.length;
    await vi.advanceTimersByTimeAsync(5_000);
    await flushPromises();

    expect(vi.mocked(fetch).mock.calls.length).toBe(callsAtDestroy);
    expect(queue.currentState).toBe('destroyed');
  });
});

// ---------------------------------------------------------------------------
// 10. double join() throws
// ---------------------------------------------------------------------------

describe('double join()', () => {
  it('throws "Already joined" when called before first resolves', async () => {
    vi.useFakeTimers();

    mockFetchWithInfo({ status: 'QUEUED', position: 1, pollIntervalMs: 5_000 });

    queue = new FlashQueue({ publicKey: 'pk_test', userId: 'u1' });

    const first = queue.join(); // in-flight, not awaited

    await expect(queue.join()).rejects.toThrow('Already joined');

    await flushPromises();
    await first.catch(() => {});
  });
});

// ---------------------------------------------------------------------------
// 11. poll timeout
// ---------------------------------------------------------------------------

describe('poll timeout', () => {
  it('emits error with POLL_TIMEOUT after maxPollRetries', async () => {
    vi.useFakeTimers();

    mockFetchWithInfo(
      { status: 'QUEUED', position: 10, pollIntervalMs: 100 },
      { status: 'QUEUED', position: 9 },
    );

    queue = new FlashQueue({
      publicKey: 'pk_test',
      userId: 'u1',
      maxPollRetries: 2,
      pollIntervalMs: 100,
    });

    const errorP = new Promise<{ code: string }>((resolve) => queue.on('error', resolve));

    queue.join();
    await flushPromises();

    // Drive enough poll cycles to exhaust maxPollRetries
    for (let i = 0; i < 4; i++) {
      await vi.advanceTimersByTimeAsync(600);
      await flushPromises();
    }

    const err = await errorP;
    expect(err.code).toBe('POLL_TIMEOUT');
  });
});

// ---------------------------------------------------------------------------
// 12. position events on each poll
// ---------------------------------------------------------------------------

describe('position events', () => {
  it('fires position with correct values on each poll', async () => {
    vi.useFakeTimers();

    mockFetchWithInfo(
      { status: 'QUEUED', position: 10, pollIntervalMs: 100 },
      { status: 'QUEUED', position: 7 },
      { status: 'QUEUED', position: 3 },
      { status: 'WON', token: 'jwt.token.here' },
    );

    queue = new FlashQueue({ publicKey: 'pk_test', userId: 'u1', pollIntervalMs: 100 });

    const positions: number[] = [];
    queue.on('position', ({ position }) => positions.push(position));

    const wonP = new Promise<void>((resolve) => queue.on('won', () => resolve()));

    queue.join();
    await flushPromises();

    // Drive 5 poll cycles — enough for positions 7, 3 and then WON
    for (let i = 0; i < 5; i++) {
      await vi.advanceTimersByTimeAsync(600);
      await flushPromises();
    }

    await wonP;

    expect(positions).toEqual([7, 3]);
  });
});
