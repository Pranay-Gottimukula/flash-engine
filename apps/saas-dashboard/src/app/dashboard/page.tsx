'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Calendar, Plus } from 'lucide-react';
import { api }            from '@/lib/api';
import { relativeTime, toErrorMessage } from '@/lib/utils';
import { PageHeader }     from '@/components/layout/page-header';
import { StatCard }       from '@/components/ui/stat-card';
import { Card }           from '@/components/ui/card';
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { Button }         from '@/components/ui/button';
import { Spinner }        from '@/components/ui/spinner';
import { EmptyState }     from '@/components/ui/empty-state';
import { ErrorBanner }    from '@/components/ui/error-banner';

interface OverviewData {
  totalEvents:              number;
  totalUsersProcessed:      number;
  averageConversionRate:    number | null;
  averageStockUtilization:  number | null;
}

interface SaleEvent {
  id:         string;
  name:       string;
  status:     'PENDING' | 'ACTIVE' | 'PAUSED' | 'ENDED';
  mode:       string;
  stockCount: number;
  rateLimit:  number;
  createdAt:  string;
}

const statusVariant: Record<SaleEvent['status'], BadgeVariant> = {
  PENDING: 'neutral',
  ACTIVE:  'success',
  PAUSED:  'warning',
  ENDED:   'error',
};

const statusLabel: Record<SaleEvent['status'], string> = {
  PENDING: 'Pending',
  ACTIVE:  'Active',
  PAUSED:  'Paused',
  ENDED:   'Ended',
};

function fmtPct(val: number | null): string {
  if (val === null) return '—';
  return `${Math.round(val * 100)}%`;
}

export default function DashboardPage() {
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [events,   setEvents]   = useState<SaleEvent[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    Promise.all([
      api.get<OverviewData>('/api/admin/overview'),
      api.get<SaleEvent[]>('/api/admin/events'),
    ])
      .then(([ov, ev]) => { setOverview(ov); setEvents(ev); })
      .catch(err => setError(toErrorMessage(err)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const createAction = (
    <Link href="/dashboard/events/new">
      <Button size="sm">
        <Plus size={16} />
        Create Event
      </Button>
    </Link>
  );

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Spinner size="md" className="text-text-tertiary" />
      </div>
    );
  }

  if (error) {
    return <ErrorBanner message={error} onRetry={load} className="mt-6" />;
  }

  return (
    <div className="animate-page-in">
      {/* ── Overview stats ─────────────────────────────────────────────── */}
      <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Events"
          value={overview?.totalEvents ?? 0}
        />
        <StatCard
          label="Users Processed"
          value={(overview?.totalUsersProcessed ?? 0).toLocaleString()}
        />
        <StatCard
          label="Avg Conversion"
          value={fmtPct(overview?.averageConversionRate ?? null)}
        />
        <StatCard
          label="Avg Utilization"
          value={fmtPct(overview?.averageStockUtilization ?? null)}
        />
      </div>

      <PageHeader title="Events" action={createAction} />

      {events.length === 0 ? (
        <EmptyState
          icon={<Calendar size={32} />}
          title="No events yet"
          description="Create your first flash sale event to get started"
          action={
            <Link href="/dashboard/events/new">
              <Button size="sm">
                <Plus size={16} />
                Create Event
              </Button>
            </Link>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {events.map(event => (
            <Link
              key={event.id}
              href={`/dashboard/events/${event.id}`}
              className="group block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface-base"
            >
              <Card
                interactive
                className="transition-[border-color] duration-150 group-hover:border-border-strong"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium text-text-primary leading-snug">{event.name}</p>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {event.mode === 'TEST' && (
                        <Badge variant="warning">TEST</Badge>
                      )}
                      <Badge variant={statusVariant[event.status]}>
                        {statusLabel[event.status]}
                      </Badge>
                    </div>
                  </div>
                  <p className="text-xs text-text-secondary">
                    {event.stockCount.toLocaleString()} items · Rate: {event.rateLimit}/s
                  </p>
                  <p className="text-xs text-text-tertiary">
                    {relativeTime(event.createdAt)}
                  </p>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
