'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LayoutGrid } from 'lucide-react';
import { api } from '@/lib/api';
import { relativeTime, toErrorMessage } from '@/lib/utils';
import { PageHeader } from '@/components/layout/page-header';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { ErrorBanner } from '@/components/ui/error-banner';
import { EmptyState } from '@/components/ui/empty-state';
import { cn } from '@/lib/cn';

// ── Types ──────────────────────────────────────────────────────────────────────

type EventStatus = 'PENDING' | 'ACTIVE' | 'PAUSED' | 'ENDED';

type EventRow = Record<string, unknown> & {
  id:             string;
  name:           string;
  clientEmail:    string;
  status:         EventStatus;
  stockCount:     number;
  stockRemaining: number;
  rateLimit:      number;
  createdAt:      string;
};

// ── Constants ──────────────────────────────────────────────────────────────────

const STATUS_OPTIONS: { label: string; value: EventStatus | 'ALL' }[] = [
  { label: 'All',     value: 'ALL'     },
  { label: 'Active',  value: 'ACTIVE'  },
  { label: 'Pending', value: 'PENDING' },
  { label: 'Paused',  value: 'PAUSED'  },
  { label: 'Ended',   value: 'ENDED'   },
];

const STATUS_VARIANT: Record<EventStatus, BadgeVariant> = {
  PENDING: 'neutral',
  ACTIVE:  'success',
  PAUSED:  'warning',
  ENDED:   'error',
};

const STATUS_LABEL: Record<EventStatus, string> = {
  PENDING: 'Pending',
  ACTIVE:  'Active',
  PAUSED:  'Paused',
  ENDED:   'Ended',
};

// ── Shared select style ────────────────────────────────────────────────────────

const SELECT_CLS = cn(
  'h-10 rounded-lg border border-border bg-surface-raised px-3 pr-8 text-sm text-text-primary',
  'outline-none transition-colors duration-150 focus:border-accent',
  'appearance-none cursor-pointer',
  'focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface-base',
);

// ── Page ───────────────────────────────────────────────────────────────────────

export default function AdminEventsPage() {
  const router = useRouter();

  const [events,       setEvents]       = useState<EventRow[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState('');
  const [statusFilter, setStatusFilter] = useState<EventStatus | 'ALL'>('ALL');
  const [clientFilter, setClientFilter] = useState('ALL');

  // ── Data ─────────────────────────────────────────────────────────────────────
  const load = useCallback(() => {
    setLoading(true);
    setError('');
    api.get<EventRow[]>('/api/admin/events')
      .then(setEvents)
      .catch(err => setError(toErrorMessage(err)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Derived filter options ────────────────────────────────────────────────────
  const clientOptions = useMemo(() => {
    const emails = [...new Set(events.map(e => e.clientEmail))].sort();
    return ['ALL', ...emails];
  }, [events]);

  // ── Filtered list ─────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return events.filter(e => {
      if (statusFilter !== 'ALL' && e.status !== statusFilter) return false;
      if (clientFilter !== 'ALL' && e.clientEmail !== clientFilter) return false;
      return true;
    });
  }, [events, statusFilter, clientFilter]);

  // ── Columns ───────────────────────────────────────────────────────────────────
  const columns: Column<EventRow>[] = [
    {
      key:      'name',
      label:    'Event Name',
      sortable: true,
    },
    {
      key:      'clientEmail',
      label:    'Client',
      sortable: true,
      render:   v => (
        <span className="text-text-secondary">{v as string}</span>
      ),
    },
    {
      key:   'status',
      label: 'Status',
      render: v => {
        const s = v as EventStatus;
        return (
          <Badge variant={STATUS_VARIANT[s] ?? 'neutral'}>
            {STATUS_LABEL[s] ?? s}
          </Badge>
        );
      },
    },
    {
      key:   'stockRemaining',
      label: 'Stock',
      render: (_, row) =>
        row.status === 'ACTIVE'
          ? `${row.stockRemaining.toLocaleString()}/${row.stockCount.toLocaleString()}`
          : row.stockCount.toLocaleString(),
    },
    {
      key:      'rateLimit',
      label:    'Rate Limit',
      sortable: true,
      render:   v => `${(v as number).toLocaleString()}/s`,
    },
    {
      key:      'createdAt',
      label:    'Created',
      sortable: true,
      render:   v => (
        <span className="text-text-secondary">{relativeTime(v as string)}</span>
      ),
    },
  ];

  // ── Render ────────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Spinner size="lg" className="text-text-tertiary" />
      </div>
    );
  }

  if (error) {
    return <ErrorBanner message={error} onRetry={load} className="mt-6" />;
  }

  return (
    <div className="animate-page-in">
      <PageHeader title="All Events" />

      {/* ── Filter bar ──────────────────────────────────────────────────── */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        {/* Status filter */}
        <div className="relative">
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as EventStatus | 'ALL')}
            aria-label="Filter by status"
            className={SELECT_CLS}
          >
            {STATUS_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          {/* Custom chevron */}
          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-text-tertiary">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </span>
        </div>

        {/* Client filter */}
        <div className="relative">
          <select
            value={clientFilter}
            onChange={e => setClientFilter(e.target.value)}
            aria-label="Filter by client"
            className={SELECT_CLS}
          >
            {clientOptions.map(email => (
              <option key={email} value={email}>
                {email === 'ALL' ? 'All clients' : email}
              </option>
            ))}
          </select>
          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-text-tertiary">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </span>
        </div>

        {/* Result count */}
        <p className="ml-auto text-xs text-text-tertiary">
          Showing{' '}
          <span className="font-medium text-text-secondary">{filtered.length}</span>
          {' '}of{' '}
          <span className="font-medium text-text-secondary">{events.length}</span>
          {' '}events
        </p>
      </div>

      {/* ── Table / empty ───────────────────────────────────────────────── */}
      {events.length === 0 ? (
        <EmptyState
          icon={<LayoutGrid size={32} />}
          title="No events registered yet"
        />
      ) : (
        <DataTable
          columns={columns}
          data={filtered}
          onRowClick={row => router.push(`/admin/events/${row.id as string}`)}
        />
      )}
    </div>
  );
}
