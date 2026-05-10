'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Radio } from 'lucide-react';
import { api } from '@/lib/api';
import { relativeTime, toErrorMessage } from '@/lib/utils';
import { StatCard }    from '@/components/ui/stat-card';
import { Badge }       from '@/components/ui/badge';
import { Spinner }     from '@/components/ui/spinner';
import { EmptyState }  from '@/components/ui/empty-state';
import { ErrorBanner } from '@/components/ui/error-banner';

// ── Types ─────────────────────────────────────────────────────────────────────

interface LiveEvent {
  id:             string;
  name:           string;
  publicKey:      string;
  mode:           string;
  clientEmail:    string;
  clientName:     string | null;
  stockTotal:     number;
  stockRemaining: number;
  admitted:       number;
  queueDepth:     number;
  rateLimit:      number;
  activatedAt:    string | null;
}

interface LiveResponse {
  events: LiveEvent[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function stockBarColor(remaining: number, total: number): string {
  if (total === 0) return 'bg-text-tertiary';
  const pct = remaining / total;
  if (pct > 0.5) return 'bg-accent';
  if (pct > 0.1) return 'bg-yellow-500';
  return 'bg-red-500';
}

function healthDot(event: LiveEvent): { color: string; label: string } {
  if (event.stockRemaining === 0)
    return { color: 'bg-red-500',    label: 'Sold out' };
  if (event.queueDepth >= event.rateLimit * 5)
    return { color: 'bg-yellow-500', label: 'Queue building' };
  return   { color: 'bg-accent',     label: 'Healthy' };
}

// ── Sub-components ────────────────────────────────────────────────────────────

function EventCard({ event }: { event: LiveEvent }) {
  const stockPct   = event.stockTotal > 0
    ? Math.min(100, Math.max(0, (event.stockRemaining / event.stockTotal) * 100))
    : 0;
  const barColor   = stockBarColor(event.stockRemaining, event.stockTotal);
  const health     = healthDot(event);
  const clientLabel = event.clientName ?? event.clientEmail;

  return (
    <Link
      href={`/admin/events/${event.id}`}
      className="group block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface-base"
    >
      <div className="rounded-lg border border-border-subtle bg-surface-raised p-5 transition-colors duration-150 group-hover:border-border-strong">

        {/* ── Header row ──────────────────────────────────────────────── */}
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              {/* Health dot */}
              <span
                className={`inline-block h-2 w-2 shrink-0 rounded-full ${health.color}`}
                style={{ animation: 'stat-pulse 2s ease-in-out infinite' }}
                title={health.label}
              />
              <p className="truncate font-semibold text-text-primary">{event.name}</p>
            </div>
            <p className="mt-0.5 truncate text-xs text-text-tertiary">{clientLabel}</p>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {event.mode === 'TEST' && (
              <Badge variant="warning">TEST</Badge>
            )}
          </div>
        </div>

        {/* ── Stock bar ───────────────────────────────────────────────── */}
        <div className="mb-3">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-xs text-text-secondary">Stock remaining</span>
            <span className="font-mono text-xs text-text-primary">
              {event.stockRemaining.toLocaleString()}&thinsp;/&thinsp;{event.stockTotal.toLocaleString()}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-surface-overlay">
            <div
              className={`h-full rounded-full transition-[width] duration-500 ${barColor}`}
              style={{ width: `${stockPct}%` }}
            />
          </div>
        </div>

        {/* ── Stats row ───────────────────────────────────────────────── */}
        <div className="flex items-center gap-4 border-t border-border-subtle pt-3 text-xs">
          <div>
            <span className="text-text-tertiary">Queue </span>
            <span className="tabular-nums font-medium text-text-primary">
              {event.queueDepth.toLocaleString()}
            </span>
          </div>
          <div>
            <span className="text-text-tertiary">Admitted </span>
            <span className="tabular-nums font-medium text-text-primary">
              {event.admitted.toLocaleString()}
            </span>
          </div>
          <div>
            <span className="text-text-tertiary">Rate </span>
            <span className="tabular-nums font-medium text-text-primary">
              {event.rateLimit.toLocaleString()}/s
            </span>
          </div>
          <div className="ml-auto text-text-tertiary">
            {event.activatedAt ? relativeTime(event.activatedAt) : '—'}
          </div>
        </div>
      </div>
    </Link>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

const REFRESH_MS = 3_000;

export default function LiveMonitoringPage() {
  const [events,   setEvents]   = useState<LiveEvent[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');
  const [fetching, setFetching] = useState(false);

  const load = useCallback((initial = false) => {
    if (initial) setLoading(true);
    setFetching(true);
    setError('');
    api.get<LiveResponse>('/api/superadmin/live')
      .then(d  => setEvents(d.events))
      .catch(e  => setError(toErrorMessage(e)))
      .finally(() => { setLoading(false); setFetching(false); });
  }, []);

  useEffect(() => {
    load(true);
    const id = setInterval(() => load(false), REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  // Aggregate stats
  const totalQueue   = events.reduce((s, e) => s + e.queueDepth,     0);
  const totalStock   = events.reduce((s, e) => s + e.stockRemaining, 0);
  const totalAdmit   = events.reduce((s, e) => s + e.admitted,       0);

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Spinner size="lg" className="text-text-tertiary" />
      </div>
    );
  }

  if (!events.length && error) {
    return <ErrorBanner message={error} onRetry={() => load(true)} className="mt-6" />;
  }

  return (
    <div className="animate-page-in">

      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div className="mb-8 flex items-start justify-between border-b border-border-subtle pb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-text-primary">Live Monitoring</h1>
            <span
              className="inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-accent"
              style={{ animation: 'stat-pulse 1.5s ease-in-out infinite' }}
              aria-label="Live"
            />
            {fetching && (
              <Spinner size="sm" className="text-text-tertiary" />
            )}
          </div>
          <p className="mt-1.5 text-sm text-text-secondary">
            {events.length === 0
              ? 'No active events'
              : `${events.length} active event${events.length !== 1 ? 's' : ''}`
            }
            {' · refreshes every 3 seconds'}
          </p>
        </div>
      </div>

      {/* Stale-data error */}
      {error && events.length > 0 && (
        <ErrorBanner message={error} onRetry={() => load(true)} className="mb-6" />
      )}

      {/* ── Aggregate stats ──────────────────────────────────────────────── */}
      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          label="Active Events"
          value={events.length}
          live
        />
        <StatCard
          label="Users in Queue"
          value={totalQueue.toLocaleString()}
          live
        />
        <StatCard
          label="Stock Remaining"
          value={totalStock.toLocaleString()}
        />
        <StatCard
          label="Total Admitted"
          value={totalAdmit.toLocaleString()}
        />
      </div>

      {/* ── Events grid ──────────────────────────────────────────────────── */}
      {events.length === 0 ? (
        <EmptyState
          icon={<Radio size={32} />}
          title="No active events"
          description="Events will appear here when activated."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {events.map(event => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      )}
    </div>
  );
}
