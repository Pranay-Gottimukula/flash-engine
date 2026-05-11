// apps/engine-gateway/src/server.ts
import express from 'express';
import cors    from 'cors';
import dotenv  from 'dotenv';

dotenv.config();

import prisma                        from './lib/prisma';
import redis, { connectRedis }       from './services/redis.service';
import queueRoutes                   from './routes/queue.routes';
import adminRoutes                   from './routes/admin.routes';
import superadminRoutes              from './routes/superadmin.routes';
import authRoutes                    from './routes/auth.routes';
import healthRouter                  from './routes/health.routes';
import jwksRouter                    from './routes/jwks.routes';
import { initDrains, stopDrain, getActiveDrains } from './services/drain.service';

const app  = express();
const PORT = process.env.PORT ?? 4000;

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map(o => o.trim())
    : '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'x-public-key',
    'x-signature',
    'x-timestamp',
    'x-admin-secret',
    'x-demo-bypass',
  ],
  credentials: true,
}));
app.use(express.json());

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/health',          healthRouter);
app.use('/api/auth',        authRoutes);
app.use('/api/queue',       queueRoutes);
app.use('/api/admin',       adminRoutes);
app.use('/api/superadmin',  superadminRoutes);
app.use('/api/.well-known/jwks', jwksRouter);

// ── Bootstrap ─────────────────────────────────────────────────────────────────
//
// WHY a bootstrap() function instead of top-level await?
//   Top-level await is only available in ES modules (type:"module" in package.json).
//   Wrapping in an async IIFE is the compatible pattern for CommonJS TypeScript.
//   It also lets us sequence startup steps clearly and handle each failure mode
//   with its own error message before exiting.

async function bootstrap(): Promise<void> {

  // ── Step 1: Connect to Redis ──────────────────────────────────────────────
  //
  // connectRedis() calls redis.connect() which fires the TCP handshake and
  // resolves once Redis emits the 'ready' event (dataset loaded, commands
  // accepted).  This guarantees the Lua scripts are registered
  // before the first /api/queue/join request can arrive.

  // @@@@@@@@@ Uncomment before production, Commented to save redis calls @@@@@@@@
  // try {
  //   await connectRedis();
  // } catch (err) {
  //   console.error('❌ Redis connection failed at startup:', err);
  //   //
  //   // STARTUP POLICY — choose one:
  //   //
  //   //   Strict (production default):
  //   //     Crash immediately.  Let the process manager / k8s restart the pod.
  //   //     The health check will fail until Redis is reachable, so no traffic
  //   //     is routed here.
  //   process.exit(1);

  //   //   Lenient (local dev / graceful degradation):
  //   //     Log the warning and continue.  Health route returns 503.
  //   //     Replace the process.exit(1) above with just a console.warn if needed:
  //   //   console.warn('⚠️  Continuing without Redis — queue endpoints will fail.');
  // }

  // ── Step 2: Verify Postgres connection ────────────────────────────────────
  //
  // Prisma uses a lazy connection pool by default — the pool is not opened
  // until the first query.  We fire a cheap SELECT 1 here to:
  //   a) Fail fast if DATABASE_URL is wrong or Postgres is down.
  //   b) Pre-warm the pool so the first real query isn't cold.
  try {
    await prisma.$connect();
    console.log('✅ Postgres connected');
  } catch (err) {
    console.error('❌ Postgres connection failed at startup:', err);
    process.exit(1);
  }

  // ── Step 3: Start HTTP server ─────────────────────────────────────────────
  //
  // Only open the port AFTER both dependencies are verified.
  // This is critical for k8s readiness probes: the pod is not considered
  // "ready" until it is actually listening, so no traffic arrives before
  // Redis and Postgres are confirmed healthy.
  const server = app.listen(PORT, () => {
    console.log(`🚀 Engine Gateway running at http://localhost:${PORT}`);
    console.log(`   Health: http://localhost:${PORT}/health`);
  });

  // ── Step 4: Resume any drain loops for events that were ACTIVE at boot ────
  //
  // Handles server restarts mid-sale — active events keep draining without
  // operator intervention. Non-fatal: events can be re-activated via the
  // admin API if this fails.
  try {
    await initDrains();
  } catch (err) {
    console.error('[bootstrap] initDrains failed — events can be re-activated manually:', err);
  }

  // ── Step 5: Graceful shutdown ─────────────────────────────────────────────
  //
  // On SIGTERM (k8s pod eviction, deploy) or SIGINT (Ctrl-C in dev):
  //   1. Stop all drain intervals so no new Redis commands are fired.
  //   2. Stop accepting new HTTP connections.
  //   3. Wait up to 5 s for in-flight requests to complete.
  //   4. Disconnect Redis and Postgres.
  //
  // The force-exit timer is unref'd so it doesn't prevent the process from
  // exiting earlier if everything clears up in time.

  let shuttingDown = false;

  async function shutdown(signal: string): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;

    console.log(`\n[server] ${signal} received — starting graceful shutdown`);

    for (const pk of getActiveDrains().events) {
      stopDrain(pk);
    }

    const forceTimer = setTimeout(() => {
      console.error('[server] Graceful shutdown timed out after 5s — force exiting');
      process.exit(1);
    }, 5_000);
    forceTimer.unref();

    await new Promise<void>(resolve => server.close(() => resolve()));

    await Promise.allSettled([
      redis.quit(),
      prisma.$disconnect(),
    ]);

    clearTimeout(forceTimer);
    console.log('[server] Graceful shutdown complete');
    process.exit(0);
  }

  process.on('SIGTERM', () => shutdown('SIGTERM').catch(() => process.exit(1)));
  process.on('SIGINT',  () => shutdown('SIGINT').catch(() => process.exit(1)));
}

bootstrap();