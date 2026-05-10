'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import { toErrorMessage } from '@/lib/utils';
import { PageHeader } from '@/components/layout/page-header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { ErrorBanner } from '@/components/ui/error-banner';
import { cn } from '@/lib/cn';

// ── Types ──────────────────────────────────────────────────────────────────────

interface HealthResponse {
  redis: {
    connected:        boolean;
    memoryUsed:       string;
    memoryMax:        string | null;
    opsPerSecond:     number;
    connectedClients: number;
    totalKeys:        number;
  };
  postgres: {
    totalConnections: number;
    idleConnections:  number;
    waitingQueries:   number;
  };
  application: {
    uptime:       string;
    memoryMB:     { rss: number; heapUsed: number };
    eventCache:   { cachedEvents: number; keys: string[] };
    activeDrains: { count: number; events: string[] };
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtTime(date: Date): string {
  return date.toLocaleTimeString(undefined, {
    hour:   '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function StatusDot({ connected }: { connected: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={cn(
          'inline-block h-2.5 w-2.5 shrink-0 rounded-full',
          connected ? 'bg-accent' : 'bg-red-500',
        )}
        style={connected ? { animation: 'stat-pulse 3s ease-in-out infinite' } : undefined}
      />
      <span className={cn(
        'text-sm font-medium',
        connected ? 'text-accent' : 'text-red-400',
      )}>
        {connected ? 'Connected' : 'Disconnected'}
      </span>
    </div>
  );
}

function CardHeader({ title, status }: { title: string; status?: ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <p className="text-sm font-semibold text-text-primary">{title}</p>
      {status}
    </div>
  );
}

function MetricItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-0.5 text-xs text-text-tertiary">{label}</p>
      <div className="text-sm font-medium text-text-primary">{children}</div>
    </div>
  );
}

function MetricGrid({ cols = 2, children }: { cols?: number; children: ReactNode }) {
  return (
    <div className={cn(
      'grid gap-x-6 gap-y-4',
      cols === 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 sm:grid-cols-3',
    )}>
      {children}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

const REFRESH_MS = 10_000;

export default function SystemHealthPage() {
  const [data,      setData]      = useState<HealthResponse | null>(null);
  const [fetching,  setFetching]  = useState(true);
  const [error,     setError]     = useState('');
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const load = useCallback(() => {
    setFetching(true);
    setError('');
    api.get<HealthResponse>('/api/superadmin/system/health')
      .then(d => { setData(d); setUpdatedAt(new Date()); })
      .catch(err => setError(toErrorMessage(err)))
      .finally(() => setFetching(false));
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  // ── Initial load state ───────────────────────────────────────────────────────
  if (!data && fetching) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Spinner size="lg" className="text-text-tertiary" />
      </div>
    );
  }

  if (!data && error) {
    return <ErrorBanner message={error} onRetry={load} className="mt-6" />;
  }

  const { redis, postgres, application } = data!;

  const refreshAction = (
    <Button
      variant="secondary"
      size="sm"
      loading={fetching}
      onClick={load}
    >
      <RefreshCw size={14} />
      Refresh
    </Button>
  );

  return (
    <div className="animate-page-in">
      <PageHeader title="System Health" action={refreshAction} />

      {/* Stale-data error banner */}
      {error && data && (
        <ErrorBanner message={error} onRetry={load} className="mb-6" />
      )}

      <div className="space-y-5">
        {/* ── Card 1: Redis ──────────────────────────────────────────────────── */}
        <Card
          header={
            <CardHeader
              title="Redis"
              status={<StatusDot connected={redis.connected} />}
            />
          }
        >
          <MetricGrid cols={2}>
            <MetricItem label="Memory">
              {redis.memoryMax
                ? `${redis.memoryUsed} / ${redis.memoryMax}`
                : redis.memoryUsed}
            </MetricItem>
            <MetricItem label="Operations">
              {redis.opsPerSecond.toLocaleString()}/s
            </MetricItem>
            <MetricItem label="Clients">
              {redis.connectedClients.toLocaleString()}
            </MetricItem>
            <MetricItem label="Keys">
              {redis.totalKeys.toLocaleString()}
            </MetricItem>
          </MetricGrid>
        </Card>

        {/* ── Card 2: PostgreSQL ─────────────────────────────────────────────── */}
        <Card header={<CardHeader title="PostgreSQL" />}>
          <MetricGrid cols={3}>
            <MetricItem label="Total Connections">
              {postgres.totalConnections.toLocaleString()}
            </MetricItem>
            <MetricItem label="Idle">
              {postgres.idleConnections.toLocaleString()}
            </MetricItem>
            <MetricItem label="Waiting Queries">
              <span className={cn(
                postgres.waitingQueries > 5
                  ? 'text-red-400'
                  : postgres.waitingQueries > 0
                    ? 'text-yellow-400'
                    : 'text-text-primary',
              )}>
                {postgres.waitingQueries.toLocaleString()}
              </span>
            </MetricItem>
          </MetricGrid>
        </Card>

        {/* ── Card 3: Application ────────────────────────────────────────────── */}
        <Card header={<CardHeader title="Application" />}>
          <MetricGrid cols={2}>
            <MetricItem label="Uptime">
              {application.uptime}
            </MetricItem>
            <MetricItem label="Memory (heap)">
              {application.memoryMB.heapUsed.toFixed(1)} MB
            </MetricItem>
            <MetricItem label="Cached Events">
              {application.eventCache.cachedEvents.toLocaleString()}
            </MetricItem>
            <MetricItem label="Active Drains">
              <span>{application.activeDrains.count.toLocaleString()}</span>
              {application.activeDrains.events.length > 0 && (
                <p className="mt-1 truncate text-xs font-normal text-text-tertiary">
                  {application.activeDrains.events.join(', ')}
                </p>
              )}
            </MetricItem>
          </MetricGrid>
        </Card>
      </div>

      {/* ── Last updated ───────────────────────────────────────────────────────── */}
      {updatedAt && (
        <p className="mt-6 text-xs text-text-tertiary">
          Last updated at {fmtTime(updatedAt)}
        </p>
      )}
    </div>
  );
}
