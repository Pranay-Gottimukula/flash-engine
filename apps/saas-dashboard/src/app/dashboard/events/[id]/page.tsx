'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Copy, Zap } from 'lucide-react';
import { api } from '@/lib/api';
import { relativeTime, toErrorMessage } from '@/lib/utils';
import { useToast } from '@/components/ui/toast';
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { Spinner } from '@/components/ui/spinner';
import { ErrorBanner } from '@/components/ui/error-banner';
import { EventStats } from '@/components/events/event-stats';
import { EventTimelineCard } from '@/components/events/event-timeline';
import { EventTimelineChart } from '@/components/events/event-timeline-chart';
import { EventKeysCard } from '@/components/events/event-keys';
import { EventFunnelCard } from '@/components/events/event-funnel';
import type { EventDetail, StatsResponse } from '@/components/events/types';

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_VARIANT: Record<string, BadgeVariant> = {
  PENDING: 'neutral',
  ACTIVE:  'success',
  PAUSED:  'warning',
  ENDED:   'error',
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast  = useToast();

  const [event,         setEvent]         = useState<EventDetail | null>(null);
  const [stats,         setStats]         = useState<StatsResponse | null>(null);
  const [loading,       setLoading]       = useState(true);
  const [loadError,     setLoadError]     = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError,   setActionError]   = useState('');
  const [showEndModal,  setShowEndModal]  = useState(false);

  const fetchEvent = useCallback(
    () => api.get<EventDetail>(`/api/admin/events/${id}`),
    [id],
  );
  const fetchStats = useCallback(
    () => api.get<StatsResponse>(`/api/admin/events/${id}/stats`),
    [id],
  );

  const load = useCallback(() => {
    setLoading(true);
    setLoadError('');
    Promise.all([fetchEvent(), fetchStats()])
      .then(([ev, st]) => { setEvent(ev); setStats(st); })
      .catch(err => setLoadError(toErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [fetchEvent, fetchStats]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (event?.status !== 'ACTIVE') return;
    const timer = setInterval(() => {
      fetchStats().then(setStats).catch(() => {});
    }, 5000);
    return () => clearInterval(timer);
  }, [event?.status, fetchStats]);

  async function handleActivate() {
    setActionError('');
    setActionLoading(true);
    try {
      await api.put(`/api/admin/events/${id}/activate`);
      const [ev, st] = await Promise.all([fetchEvent(), fetchStats()]);
      setEvent(ev); setStats(st);
      toast.success('Event activated — queue is now open');
    } catch (err) {
      setActionError(toErrorMessage(err));
    } finally {
      setActionLoading(false);
    }
  }

  async function handleEnd() {
    setShowEndModal(false);
    setActionError('');
    setActionLoading(true);
    try {
      await api.put(`/api/admin/events/${id}/end`);
      const [ev, st] = await Promise.all([fetchEvent(), fetchStats()]);
      setEvent(ev); setStats(st);
      toast.success('Event ended — queue is closed');
    } catch (err) {
      setActionError(toErrorMessage(err));
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDuplicate() {
    setActionError('');
    setActionLoading(true);
    try {
      const { id: newId } = await api.post<{ id: string }>(`/api/admin/events/${id}/duplicate`);
      toast.success('Event duplicated');
      router.push(`/dashboard/events/${newId}`);
    } catch (err) {
      setActionError(toErrorMessage(err));
      setActionLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="py-8">
        <ErrorBanner message={loadError} onRetry={load} />
      </div>
    );
  }

  if (!event) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-text-secondary">
        Event not found.
      </div>
    );
  }

  const isActive     = event.status === 'ACTIVE';
  const showTimeline = (isActive || event.status === 'ENDED') && event.timeline;

  return (
    <div className="animate-page-in">
      {/* ── Test Mode Banner ────────────────────────────────────────────────── */}
      {event.mode === 'TEST' && (
        <div className="mb-6 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm font-medium text-yellow-400">
          TEST MODE — Tokens are marked with <code className="font-mono">test: true</code>. Stock resets every 5 minutes.
        </div>
      )}

      {/* ── Page header ─────────────────────────────────────────────────────── */}
      <div className="mb-6 flex items-start justify-between border-b border-border-subtle pb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold text-text-primary">{event.name}</h1>
          <Badge variant={STATUS_VARIANT[event.status]}>
            {event.status.charAt(0) + event.status.slice(1).toLowerCase()}
          </Badge>
          {event.mode === 'TEST' && (
            <Badge variant="warning">TEST</Badge>
          )}
        </div>

        <div className="ml-4 flex shrink-0 items-center gap-2">
          {event.status === 'PENDING' && (
            <Button loading={actionLoading} onClick={handleActivate}>
              <Zap size={15} fill="currentColor" />
              Activate Event
            </Button>
          )}
          {event.status === 'ACTIVE' && (
            <Button
              variant="danger"
              loading={actionLoading}
              onClick={() => setShowEndModal(true)}
            >
              End Event
            </Button>
          )}
          {event.status === 'PAUSED' && (
            <span className="text-sm font-medium text-yellow-400">
              Event paused by admin
            </span>
          )}
          {event.status === 'ENDED' && (
            <span className="text-sm text-text-tertiary">
              Ended {relativeTime(event.createdAt)}
            </span>
          )}
          <Button
            variant="secondary"
            loading={actionLoading}
            onClick={handleDuplicate}
          >
            <Copy size={14} />
            Duplicate
          </Button>
        </div>
      </div>

      {actionError && (
        <ErrorBanner message={actionError} className="mb-6" />
      )}

      {/* ── Shared sections ─────────────────────────────────────────────────── */}
      <EventStats event={event} stats={stats} isLive={isActive} />

      {event.status !== 'PENDING' && (
        <div className="mb-5">
          <EventTimelineChart eventId={event.id} status={event.status} />
        </div>
      )}

      <div className="space-y-5">
        {showTimeline && (
          <EventTimelineCard timeline={event.timeline!} status={event.status} />
        )}
        <EventKeysCard event={event} />
        {stats?.funnel && <EventFunnelCard funnel={stats.funnel} />}
      </div>

      {/* ── Back link ───────────────────────────────────────────────────────── */}
      <div className="mt-8">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 rounded text-sm text-text-tertiary transition-colors hover:text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface-base"
        >
          <ArrowLeft size={14} />
          Back to events
        </Link>
      </div>

      {/* ── End Event modal ─────────────────────────────────────────────────── */}
      <Modal
        isOpen={showEndModal}
        onClose={() => { if (!actionLoading) setShowEndModal(false); }}
        title="End Event"
      >
        <div className="space-y-4">
          <p className="text-sm text-text-secondary">
            Are you sure you want to end{' '}
            <span className="font-medium text-text-primary">{event.name}</span>?
            {' '}This cannot be undone.
          </p>
          <div className="flex gap-3">
            <Button
              variant="secondary"
              onClick={() => setShowEndModal(false)}
              disabled={actionLoading}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button variant="danger" onClick={handleEnd} loading={actionLoading} className="flex-1">
              End Event
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
