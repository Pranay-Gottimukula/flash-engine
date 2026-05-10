'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { relativeTime, toErrorMessage } from '@/lib/utils';
import { StatCard } from '@/components/ui/stat-card';
import { Card } from '@/components/ui/card';
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Spinner } from '@/components/ui/spinner';
import { ErrorBanner } from '@/components/ui/error-banner';

// ── Types ─────────────────────────────────────────────────────────────────────

type ActiveEventRow = Record<string, unknown> & {
  id:             string;
  clientName:     string;
  name:           string;
  stockRemaining: number;
  stockTotal:     number;
  queueDepth:     number;
  rateLimit:      number;
  status:         string;
  activatedAt:    string;
};

interface OverviewResponse {
  events: {
    active: number;
    total:  number;
  };
  live: {
    totalUsersInQueue:      number;
    totalStockRemaining:    number;
    totalRateLimitCapacity: number;
  };
  activeEvents: ActiveEventRow[];
  last24h: {
    eventsCreated: number;
    totalRequests: number;
    results: {
      WON:          number;
      SOLD_OUT:     number;
      QUEUED:       number;
      RATE_LIMITED: number;
    };
  };
}

// ── Constants ──────────────────────────────────────────────────────────────────

const REFRESH_MS = 10_000;

const STATUS_VARIANT: Record<string, BadgeVariant> = {
  ACTIVE: 'success',
  PAUSED: 'warning',
  ENDED:  'error',
};

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Active',
  PAUSED: 'Paused',
  ENDED:  'Ended',
};

// ── Sub-components ─────────────────────────────────────────────────────────────

function StockCell({ remaining, total }: { remaining: number; total: number }) {
  const pct = total > 0 ? Math.min(100, Math.max(0, (remaining / total) * 100)) : 0;
  return (
    <div className="min-w-[90px] space-y-1.5">
      <span className="tabular-nums text-xs font-medium text-text-primary">
        {remaining.toLocaleString()}/{total.toLocaleString()}
      </span>
      <div className="h-1 w-20 overflow-hidden rounded-full bg-surface-overlay">
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="tabular-nums text-2xl font-bold text-text-primary">{value}</p>
      <p className="mt-0.5 text-xs text-text-secondary">{label}</p>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function AdminOverviewPage() {
  const router = useRouter();
  const [data,     setData]     = useState<OverviewResponse | null>(null);
  const [fetching, setFetching] = useState(true);
  const [error,    setError]    = useState('');

  const load = useCallback(() => {
    setFetching(true);
    setError('');
    api.get<OverviewResponse>('/api/superadmin/overview')
      .then(d => setData(d))
      .catch(err => setError(toErrorMessage(err)))
      .finally(() => setFetching(false));
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  // ── Loading state ────────────────────────────────────────────────────────────
  if (!data && fetching) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Spinner size="lg" className="text-text-tertiary" />
      </div>
    );
  }

  if (!data && error) {
    return (
      <ErrorBanner message={error} onRetry={load} className="mt-6" />
    );
  }

  const stats = data!;
  const activeRows = stats.activeEvents ?? [];
  const h24 = stats.last24h;

  const tableColumns: Column<ActiveEventRow>[] = [
    {
      key:      'clientName',
      label:    'Client',
      sortable: true,
    },
    {
      key:      'name',
      label:    'Event Name',
      sortable: true,
    },
    {
      key:   'stockRemaining',
      label: 'Stock',
      render: (_, row) => (
        <StockCell remaining={row.stockRemaining} total={row.stockTotal} />
      ),
    },
    {
      key:      'queueDepth',
      label:    'Queue Depth',
      sortable: true,
      render:   v => (v as number).toLocaleString(),
    },
    {
      key:      'rateLimit',
      label:    'Rate Limit',
      sortable: true,
      render:   v => `${(v as number).toLocaleString()}/s`,
    },
    {
      key:   'status',
      label: 'Status',
      render: v => (
        <Badge variant={STATUS_VARIANT[v as string] ?? 'neutral'}>
          {STATUS_LABEL[v as string] ?? (v as string)}
        </Badge>
      ),
    },
    {
      key:   'activatedAt',
      label: 'Duration',
      render: v => (
        <span className="text-text-secondary">{relativeTime(v as string)}</span>
      ),
    },
  ];

  return (
    <div className="animate-page-in">
      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div className="mb-8 flex items-center justify-between border-b border-border-subtle pb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold text-text-primary">Platform Overview</h1>
          {fetching && (
            <span
              className="inline-block h-2 w-2 shrink-0 rounded-full bg-accent"
              style={{ animation: 'stat-pulse 1s ease-in-out infinite' }}
              aria-label="Refreshing"
            />
          )}
        </div>
      </div>

      {/* Inline error when data is stale but refresh failed */}
      {error && data && (
        <ErrorBanner message={error} onRetry={load} className="mb-6" />
      )}

      {/* ── Top stats ───────────────────────────────────────────────────── */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Active Sales"
          value={stats.events.active}
          live
        />
        <StatCard
          label="Users in Queue"
          value={stats.live.totalUsersInQueue.toLocaleString()}
          live
        />
        <StatCard
          label="Stock Protected"
          value={stats.live.totalStockRemaining.toLocaleString()}
        />
        <StatCard
          label="Throughput Capacity"
          value={`${stats.live.totalRateLimitCapacity.toLocaleString()}/sec`}
        />
      </div>

      {/* ── Active events ───────────────────────────────────────────────── */}
      <Card
        header={<h2 className="text-sm font-semibold text-text-primary">Active Events</h2>}
        padding={false}
        className="mb-6"
      >
        {activeRows.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-text-tertiary">
            No active sales right now
          </p>
        ) : (
          <DataTable
            columns={tableColumns}
            data={activeRows}
            onRowClick={row => router.push(`/admin/events/${row.id as string}`)}
          />
        )}
      </Card>

      {/* ── Last 24 hours ───────────────────────────────────────────────── */}
      <Card header={<h2 className="text-sm font-semibold text-text-primary">Last 24 Hours</h2>}>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3">
          <MiniStat label="Events Created" value={h24.eventsCreated} />
          <MiniStat label="Total Requests" value={h24.totalRequests.toLocaleString()} />
          <MiniStat label="Won"            value={h24.results.WON.toLocaleString()} />
          <MiniStat label="Sold Out"       value={h24.results.SOLD_OUT.toLocaleString()} />
          <MiniStat label="Queued"         value={h24.results.QUEUED.toLocaleString()} />
          <MiniStat label="Rate Limited"   value={h24.results.RATE_LIMITED.toLocaleString()} />
        </div>
      </Card>
    </div>
  );
}
