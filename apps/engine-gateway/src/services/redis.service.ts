// apps/engine-gateway/src/services/redis.service.ts
//
// ──────────────────────────────────────────────────────────────────────────────
// ARCHITECTURAL OVERVIEW
// ──────────────────────────────────────────────────────────────────────────────
//
// This module owns the single ioredis connection shared across the process.
// It also acts as the *script registry* — all Lua scripts are loaded here at
// startup so they are cached server-side by Redis (SCRIPT LOAD / EVALSHA).
//
// WHY A SINGLETON?
//   Node.js event loop is single-threaded.  A single persistent TCP connection
//   to Redis is faster and cheaper than a connection pool.  ioredis handles
//   command pipelining automatically, so throughput is not limited by the
//   single connection.
//
// WHY NOT redis-om / Upstash REST?
//   Both add HTTP overhead per command.  For the hot-path Lua execution we
//   need sub-millisecond latency.  Raw ioredis over TCP is the right tool.
//
// CLUSTER SUPPORT
//   If you later move to Redis Cluster (AWS ElastiCache cluster mode, etc.),
//   replace `new Redis(url)` with `new Redis.Cluster([...nodes])`.
//   The Lua script must then use KEYS[1] consistently so Redis can route it
//   to the correct shard.  The `{publicKey}` hash-slot trick ensures all
//   keys for one event land on the same shard.
// ──────────────────────────────────────────────────────────────────────────────

import Redis from 'ioredis';
import { readFileSync } from 'fs';
import { join } from 'path';

// ── Environment ───────────────────────────────────────────────────────────────

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
//
// TODO: In production, point this at a Redis instance with:
//   - AOF persistence (appendonly yes) for durability
//   - maxmemory-policy = noeviction (NEVER let Redis silently drop your stock
//     counter under memory pressure — fail loudly instead)
//   - requirepass / TLS enabled (use rediss:// scheme)

// ── Connection ────────────────────────────────────────────────────────────────

// const redis = new Redis(REDIS_URL, {
//   // Exponential back-off: 200 ms, 400 ms, 800 ms … capped at 30 s.
//   // This prevents thundering-herd reconnects if Redis restarts.
//   retryStrategy: (times: number) => Math.min(times * 200, 30_000),

//   // lazyConnect: true means the TCP connection is NOT established until the
//   // first command is sent (or redis.connect() is called explicitly).
//   // This lets the Express server start up even if Redis isn't ready yet,
//   // and your health-check route can report degraded status gracefully.
//   lazyConnect: true,

//   // TODO: For TLS (rediss://), add:
//   tls: { rejectUnauthorized: false },

//   // TODO: For Redis Sentinel (HA failover), replace the URL with:
//   //   sentinels: [{ host: '...', port: 26379 }],
//   //   name: 'mymaster',
// });

const globalForRedis = globalThis as unknown as { redis?: Redis }

const redis = globalForRedis.redis ?? new Redis(REDIS_URL, {
  retryStrategy: (times: number) => Math.min(times * 200, 30_000),
  lazyConnect: true,
  tls: { rejectUnauthorized: false },
});



// ── Lifecycle events ──────────────────────────────────────────────────────────

redis.on('connect',      () => console.log('✅ Redis connected'));
redis.on('ready',        () => console.log('✅ Redis ready — Lua scripts registered'));
redis.on('error', (err: Error) => console.error('❌ Redis error:', err.message));
redis.on('reconnecting', () => console.warn('⚠️  Redis reconnecting…'));
redis.on('close',        () => console.warn('⚠️  Redis connection closed'));

// ── Startup helper ────────────────────────────────────────────────────────────
//
// Call this ONCE during server bootstrap (server.ts → bootstrap()).
// Because lazyConnect: true is set, the TCP handshake to Redis has NOT happened
// yet when this module is first imported.  Calling connectRedis() fires it
// explicitly so we can:
//   a) Fail fast if Redis is unreachable at startup (rather than on the first
//      real request, which would result in a confusing 500 to an end-user).
//   b) Guarantee the Lua scripts are registered before any
//      queue/join request arrives.
//
// The outer try/catch in server.ts lets you decide the startup policy:
//   - Strict:  process.exit(1) if Redis is down (safest for production).
//   - Lenient: log a warning and continue (acceptable if Redis is non-critical
//              for some routes, e.g., health checks still need to work).

export async function connectRedis(): Promise<void> {
  // redis.connect() resolves when the 'ready' event fires (i.e., after the
  // TCP handshake AND the Redis server has finished loading its dataset).
  // It rejects if the connection cannot be established within the timeout.
  await redis.connect();
}

// ── Lua Script: Queue Admission ───────────────────────────────────────────────
//
// CONTEXT — Why Lua?
//
//   A flash sale join request requires these operations atomically:
//     1. Check event status  (HGET flash:event:{key} status)
//     2. Check duplicate     (ZSCORE queue, HEXISTS result)
//     3. Check queueCap      (admitted >= queueCap → SOLD_OUT)
//     4. Enqueue             (ZADD queue, HINCRBY admitted)
//
//   Lua scripts run atomically on a single Redis thread, eliminating TOCTOU races.
//
// HOW redis.defineCommand() WORKS
//
//   ioredis ships defineCommand() which wraps EVALSHA under the hood.
//   On the first call it falls back to EVAL if the SHA isn't cached yet.
//   This means you get automatic script caching without manually calling
//   SCRIPT LOAD at startup.
//
// ──────────────────────────────────────────────────────────────────────────────


const QUEUE_ADMISSION_LUA = readFileSync(
  join(__dirname, '../scripts/queue-admission.lua'),
  'utf-8'
);

declare module 'ioredis' {
  interface Redis {
    queueAdmission(
      eventKey:  string,
      queueKey:  string,
      resultKey: string,
      nowMs:     number,
      userId:    string,
    ): Promise<[number, string, number?, number?]>;
  }
}

redis.defineCommand('queueAdmission', {
  numberOfKeys: 3,
  lua: QUEUE_ADMISSION_LUA,
});
//
// Call site (in queue.controller.ts):
//   const { eventKey, queueKey, resultKey } = getRedisKeys(publicKey);
//   const [code, reason, position] = await redis.queueAdmission(
//     eventKey, queueKey, resultKey, Date.now(), userId,
//   );

// ── Lua Script: Drain Process ────────────────────────────────────────────────
//
// Used by drain.service.ts to atomically claim one stock unit for a queued user.
// KEYS[1] = flash:event:{publicKey}, KEYS[2] = flash:result:{publicKey}
// ARGV[1] = userId
// Returns 1 (WON) or -1 (SOLD_OUT).

const DRAIN_PROCESS_LUA = readFileSync(
  join(__dirname, '../scripts/drain-process.lua'),
  'utf-8'
);

declare module 'ioredis' {
  interface Redis {
    drainProcess(
      eventKey:  string,
      resultKey: string,
      userId:    string,
    ): Promise<number>;
  }
}

redis.defineCommand('drainProcess', {
  numberOfKeys: 2,
  lua: DRAIN_PROCESS_LUA,
});

// ── Key helpers ───────────────────────────────────────────────────────────────

export function getRedisKeys(publicKey: string) {
  return {
    eventKey:  `flash:event:${publicKey}`,
    queueKey:  `flash:queue:${publicKey}`,
    resultKey: `flash:result:${publicKey}`,
  };
}

// ── Export ────────────────────────────────────────────────────────────────────

export default redis;
//
// All other modules import this singleton:
//   import redis from '../services/redis.service';
//
// NEVER create a second `new Redis()` elsewhere — it wastes a TCP connection
// and breaks the single-connection assumption above.
