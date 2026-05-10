import { Request, Response } from 'express';
import prisma, { getPoolStats } from '../lib/prisma';
import redis, { getRedisKeys } from '../services/redis.service';
import { getCacheStats } from '../services/event-cache.service';
import { getActiveDrains } from '../services/drain.service';
import { endEventCore } from '../services/event-lifecycle.service';

function parseInfoField(info: string, field: string): string | null {
  const match = info.match(new RegExp(`^${field}:(.+)$`, 'm'));
  return match ? match[1].trim() : null;
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return [d && `${d}d`, h && `${h}h`, m && `${m}m`, `${s}s`].filter(Boolean).join(' ');
}

// ── GET /api/superadmin/clients ───────────────────────────────────────────────

export async function listClients(req: Request, res: Response): Promise<void> {
  const [clients, activeEventCounts, rawTotalUsers] = await Promise.all([
    prisma.client.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id:        true,
        email:     true,
        name:      true,
        role:      true,
        suspended: true,
        publicKey: true,
        createdAt: true,
        _count: { select: { events: true } },
      },
    }),
    prisma.saleEvent.groupBy({
      by:    ['clientId'],
      where: { status: 'ACTIVE' },
      _count: { _all: true },
    }),
    prisma.$queryRaw<{ id: string; totalUsers: bigint }[]>`
      SELECT c.id, COUNT(qa.id) as "totalUsers"
      FROM "Client" c
      LEFT JOIN "SaleEvent" se ON se."clientId" = c.id
      LEFT JOIN "QueueAttempt" qa ON qa."saleEventId" = se.id
      GROUP BY c.id
    `,
  ]);

  const activeEventMap = new Map<string, number>(
    activeEventCounts.map(r => [r.clientId, r._count._all])
  );
  const totalUsersMap = new Map<string, number>(
    rawTotalUsers.map(r => [r.id, Number(r.totalUsers)])
  );

  res.status(200).json(
    clients.map(c => ({
      id:                  c.id,
      email:               c.email,
      name:                c.name,
      role:                c.role,
      suspended:           c.suspended,
      publicKey:           c.publicKey,
      createdAt:           c.createdAt,
      eventsCount:         c._count.events,
      activeEvents:        activeEventMap.get(c.id) ?? 0,
      totalUsersProcessed: totalUsersMap.get(c.id)  ?? 0,
    }))
  );
}

// ── PUT /api/superadmin/clients/:id/suspend ───────────────────────────────────

export async function suspendClient(req: Request<{ id: string }>, res: Response): Promise<void> {
  const { id } = req.params;

  const client = await prisma.client.findUnique({ where: { id }, select: { id: true } });
  if (!client) {
    res.status(404).json({ error: 'Client not found' });
    return;
  }

  await prisma.client.update({
    where: { id },
    data:  { suspended: true },
  });

  const activeEvents = await prisma.saleEvent.findMany({
    where:  { clientId: id, status: 'ACTIVE' },
    select: { id: true, publicKey: true },
  });

  await Promise.all(activeEvents.map(event => endEventCore(event)));

  res.status(200).json({
    message:           'Client suspended',
    activeEventsEnded: activeEvents.length,
  });
}

// ── PUT /api/superadmin/clients/:id/unsuspend ─────────────────────────────────

export async function unsuspendClient(req: Request<{ id: string }>, res: Response): Promise<void> {
  const { id } = req.params;

  const client = await prisma.client.findUnique({ where: { id }, select: { id: true } });
  if (!client) {
    res.status(404).json({ error: 'Client not found' });
    return;
  }

  await prisma.client.update({
    where: { id },
    data:  { suspended: false },
  });

  res.status(200).json({ message: 'Client unsuspended' });
}

// ── GET /api/superadmin/system/health ─────────────────────────────────────────

export async function getSystemHealth(_req: Request, res: Response): Promise<void> {
  const connected = redis.status === 'ready';

  const [memInfo, statsInfo, clientsInfo, totalKeys] = await Promise.all([
    redis.info('memory').catch(() => ''),
    redis.info('stats').catch(() => ''),
    redis.info('clients').catch(() => ''),
    redis.dbsize().catch(() => 0),
  ]);

  const pool      = getPoolStats();
  const mem       = process.memoryUsage();
  const drains    = getActiveDrains();
  const cacheStats = getCacheStats();

  res.status(200).json({
    redis: {
      connected,
      memoryUsed:       parseInfoField(memInfo,    'used_memory_human'),
      memoryMax:        parseInfoField(memInfo,    'maxmemory_human'),
      opsPerSecond:     Number(parseInfoField(statsInfo,   'instantaneous_ops_per_sec') ?? 0),
      connectedClients: Number(parseInfoField(clientsInfo, 'connected_clients')         ?? 0),
      totalKeys,
    },
    postgres: {
      totalConnections: pool.total,
      idleConnections:  pool.idle,
      waitingQueries:   pool.waiting,
    },
    application: {
      uptime:   formatUptime(process.uptime()),
      memoryMB: {
        rss:      +(mem.rss      / 1024 / 1024).toFixed(1),
        heapUsed: +(mem.heapUsed / 1024 / 1024).toFixed(1),
      },
      eventCache:   cacheStats,
      activeDrains: drains,
    },
    timestamp: new Date().toISOString(),
  });
}

// ── GET /api/superadmin/overview ──────────────────────────────────────────────

export async function getPlatformOverview(_req: Request, res: Response): Promise<void> {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [
    totalClients,
    totalEvents,
    activeCount,
    pausedCount,
    pendingCount,
    endedCount,
    activeEvents,
    eventsCreated24h,
    attempts24h,
  ] = await Promise.all([
    prisma.client.count(),
    prisma.saleEvent.count(),
    prisma.saleEvent.count({ where: { status: 'ACTIVE' } }),
    prisma.saleEvent.count({ where: { status: 'PAUSED' } }),
    prisma.saleEvent.count({ where: { status: 'PENDING' } }),
    prisma.saleEvent.count({ where: { status: 'ENDED' } }),
    prisma.saleEvent.findMany({
      where:  { status: 'ACTIVE' },
      select: { publicKey: true, rateLimit: true },
    }),
    prisma.saleEvent.count({ where: { createdAt: { gte: since24h } } }),
    prisma.queueAttempt.groupBy({
      by:    ['result'],
      where: { createdAt: { gte: since24h } },
      _count: { _all: true },
    }),
  ]);

  // Fetch queue depth + stock for every active event in one pipeline
  const pipeline = redis.pipeline();
  for (const e of activeEvents) {
    const { eventKey, queueKey } = getRedisKeys(e.publicKey);
    pipeline.zcard(queueKey);
    pipeline.hget(eventKey, 'stock');
  }
  const pipelineResults = (await pipeline.exec()) ?? [];

  let totalUsersInQueue    = 0;
  let totalStockRemaining  = 0;
  let totalRateLimitCapacity = 0;

  for (let i = 0; i < activeEvents.length; i++) {
    const queueDepth = (pipelineResults[i * 2]?.[1]   as number | null) ?? 0;
    const stockStr   = (pipelineResults[i * 2 + 1]?.[1] as string | null);
    totalUsersInQueue     += Number(queueDepth);
    totalStockRemaining   += stockStr !== null ? parseInt(stockStr, 10) : 0;
    totalRateLimitCapacity += activeEvents[i].rateLimit;
  }

  const resultMap: Record<string, number> = {};
  let totalRequests = 0;
  for (const row of attempts24h) {
    resultMap[row.result] = row._count._all;
    totalRequests        += row._count._all;
  }

  res.status(200).json({
    clients: { total: totalClients },
    events:  { total: totalEvents, active: activeCount, paused: pausedCount, pending: pendingCount, ended: endedCount },
    live: {
      totalUsersInQueue,
      totalStockRemaining,
      totalRateLimitCapacity,
    },
    last24h: {
      eventsCreated: eventsCreated24h,
      totalRequests,
      results: {
        WON:          resultMap['WON']          ?? 0,
        SOLD_OUT:     resultMap['SOLD_OUT']     ?? 0,
        QUEUED:       resultMap['QUEUED']       ?? 0,
        RATE_LIMITED: resultMap['RATE_LIMITED'] ?? 0,
      },
    },
    timestamp: new Date().toISOString(),
  });
}

// ── GET /api/superadmin/live ──────────────────────────────────────────────────
//
// Returns all ACTIVE events with live Redis data combined — the "war room" feed.

export async function getLiveEvents(req: Request, res: Response): Promise<void> {
  const activeEvents = await prisma.saleEvent.findMany({
    where:   { status: 'ACTIVE' },
    include: { client: { select: { email: true, name: true } } },
  });

  if (activeEvents.length === 0) {
    res.json({ events: [] });
    return;
  }

  const pipeline = redis.pipeline();
  for (const event of activeEvents) {
    pipeline.hmget(`flash:event:${event.publicKey}`, 'stock', 'admitted', 'rateLimit');
    pipeline.zcard(`flash:queue:${event.publicKey}`);
  }
  const results = await pipeline.exec();

  const live = activeEvents.map((event, i) => {
    const [, hashData]    = (results![i * 2]     ?? [null, []]) as [Error | null, (string | null)[]];
    const [, queueDepth]  = (results![i * 2 + 1] ?? [null, 0])  as [Error | null, number];
    const [stock, admitted, rateLimit] = hashData ?? [];

    return {
      id:             event.id,
      name:           event.name,
      publicKey:      event.publicKey,
      mode:           event.mode,
      clientEmail:    event.client.email,
      clientName:     event.client.name ?? null,
      stockTotal:     event.stockCount,
      stockRemaining: parseInt(stock     ?? '0',  10),
      admitted:       parseInt(admitted  ?? '0',  10),
      queueDepth:     queueDepth ?? 0,
      rateLimit:      parseInt(rateLimit ?? '50', 10),
      activatedAt:    event.activatedAt,
    };
  });

  res.json({ events: live });
}
