// apps/engine-gateway/src/routes/health.routes.ts
//
// ──────────────────────────────────────────────────────────────────────────────
// HEALTH CHECK ROUTE
// ──────────────────────────────────────────────────────────────────────────────
//
// PURPOSE
//   A /health endpoint is a prerequisite for:
//     • Kubernetes liveness + readiness probes
//     • Load-balancer health checks (AWS ALB, GCP HTTPS LB)
//     • Uptime monitors (Better Uptime, Checkly, etc.)
//     • Graceful rolling deployments — the LB only routes traffic to pods
//       that return 200 from /health
//
// TWO PROBE TYPES TO KNOW:
//
//   Liveness probe  — Is the process alive?
//     Returns 200 if the Node process is running, even if dependencies are down.
//     k8s restarts the pod only if THIS returns non-200 / times out repeatedly.
//
//   Readiness probe — Is the process ready to serve traffic?
//     Returns 200 only when Redis AND Postgres are reachable.
//     k8s removes the pod from the Service endpoint pool until it is ready.
//     This is the probe you want during a Redis connection blip.
//
//   Map /health/live  → liveness  (always 200 if process is up)
//   Map /health/ready → readiness (200 only when deps are OK)
//
//   For simplicity, this stub uses a single /health route.  Split into
//   /health/live and /health/ready when you write the k8s manifests.
// ──────────────────────────────────────────────────────────────────────────────

import { Router, Request, Response } from 'express';
import { PrismaClient }              from '@prisma/client';
import redis                          from '../services/redis.service';

const router    = Router();
const prisma    = new PrismaClient();
//
// TODO: Import a shared Prisma singleton instead of creating a new instance here.
//       Multiple PrismaClient instances open multiple connection pools, which
//       exhausts Postgres connections under load.
//       Pattern: src/lib/prisma.ts → export const prisma = new PrismaClient();

// ── GET /health ───────────────────────────────────────────────────────────────

router.get('/', async (_req: Request, res: Response): Promise<void> => {
  //
  // DESIGN NOTE: Probe Redis and Postgres in parallel — no need to await
  // sequentially.  Total response time = max(redisLatency, postgresLatency).

  const checks = await Promise.allSettled([
    redisCheck(),
    postgresCheck(),
  ]);

  const [redisResult, postgresResult] = checks;

  const status = {
    redis:    redisResult.status    === 'fulfilled' ? 'ok'   : 'error',
    postgres: postgresResult.status === 'fulfilled' ? 'ok'   : 'error',
    redisError:    redisResult.status    === 'rejected' ? String(redisResult.reason)    : undefined,
    postgresError: postgresResult.status === 'rejected' ? String(postgresResult.reason) : undefined,
  };

  const isHealthy = status.redis === 'ok' && status.postgres === 'ok';

  // Return 503 if any dependency is down so load-balancers remove this pod.
  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    ...status,
  });
});

// ── Dependency probe helpers ──────────────────────────────────────────────────

/**
 * Verifies the Redis connection is alive.
 *
 * TODO: You can extend this to also check:
 *   - That a key from the flash:event:* namespace is readable (warm-up check)
 *   - Memory usage via `redis.info('memory')` to alert on high-watermarks
 */
async function redisCheck(): Promise<void> {
  const pong = await redis.ping();
  if (pong !== 'PONG') throw new Error(`Unexpected PING response: ${pong}`);
}

/**
 * Verifies the Postgres connection is alive with a minimal query.
 *
 * `SELECT 1` is the idiomatic liveness query — it exercises the connection
 * pool without touching any application tables.
 *
 * TODO: Replace raw $queryRaw with a Prisma ping helper once available.
 *       Track: https://github.com/prisma/prisma/issues/3545
 */
async function postgresCheck(): Promise<void> {
  await (prisma as any).$queryRaw`SELECT 1`;
  //
  // NOTE: The cast to `any` is a current Prisma limitation — $queryRaw returns
  // unknown[] and TypeScript can't infer the result of `SELECT 1` automatically.
  // Safe to leave as-is for a health check.
}

// ── Export ────────────────────────────────────────────────────────────────────

export default router;
//
// Mount in server.ts:
//   import healthRouter from './routes/health.routes';
//   app.use('/health', healthRouter);
//
// Probe URLs:
//   curl http://localhost:4000/health
