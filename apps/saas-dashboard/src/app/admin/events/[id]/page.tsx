'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { api } from '@/lib/api';
import { toErrorMessage } from '@/lib/utils';
import { useToast } from '@/components/ui/toast';
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Modal } from '@/components/ui/modal';
import { Spinner } from '@/components/ui/spinner';
import { ErrorBanner } from '@/components/ui/error-banner';
import { CopyableField } from '@/components/ui/copyable-field';
import { EventStats } from '@/components/events/event-stats';
import { EventTimelineCard } from '@/components/events/event-timeline';
import { EventKeysCard } from '@/components/events/event-keys';
import { EventFunnelCard } from '@/components/events/event-funnel';
import type { EventDetail, StatsResponse } from '@/components/events/types';

// ── Types ─────────────────────────────────────────────────────────────────────

interface AdminEventDetail extends EventDetail {
  clientId:        string;
  clientEmail:     string;
  clientPublicKey: string;
  endedAt:         string | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_VARIANT: Record<string, BadgeVariant> = {
  PENDING: 'neutral',
  ACTIVE:  'success',
  PAUSED:  'warning',
  ENDED:   'error',
};

type ModalAction = 'pause' | 'resume' | 'end' | 'activate';

const MODAL_COPY: Record<ModalAction, { title: string; body: (name: string) => string; confirm: string }> = {
  pause: {
    title:   'Pause event?',
    body:    name => `Pause "${name}"? Users will be told the sale is temporarily paused.`,
    confirm: 'Pause Event',
  },
  resume: {
    title:   'Resume event?',
    body:    name => `Resume "${name}"? The queue will reopen immediately.`,
    confirm: 'Resume Event',
  },
  end: {
    title:   'Force end event?',
    body:    name => `Force end "${name}"? This will close the queue and cannot be undone.`,
    confirm: 'Force End',
  },
  activate: {
    title:   'Activate event?',
    body:    name => `Activate "${name}"? The queue will open and users can start joining.`,
    confirm: 'Activate',
  },
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AdminEventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const toast  = useToast();

  const [event,         setEvent]         = useState<AdminEventDetail | null>(null);
  const [stats,         setStats]         = useState<StatsResponse | null>(null);
  const [loading,       setLoading]       = useState(true);
  const [loadError,     setLoadError]     = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError,   setActionError]   = useState('');
  const [pendingAction, setPendingAction] = useState<ModalAction | null>(null);

  const fetchEvent = useCallback(
    () => api.get<AdminEventDetail>(`/api/admin/events/${id}`),
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

  // Auto-refresh stats every 5 s when live
  useEffect(() => {
    if (event?.status !== 'ACTIVE' && event?.status !== 'PAUSED') return;
    const timer = setInterval(() => {
      fetchStats().then(setStats).catch(() => {});
    }, 5000);
    return () => clearInterval(timer);
  }, [event?.status, fetchStats]);

  async function runAction(action: ModalAction) {
    setPendingAction(null);
    setActionError('');
    setActionLoading(true);

    const toastMessages: Record<ModalAction, string> = {
      pause:    'Event paused',
      resume:   'Event resumed — queue is open',
      end:      'Event force-ended',
      activate: 'Event activated — queue is now open',
    };

    try {
      await api.put(`/api/admin/events/${id}/${action}`);
      const [ev, st] = await Promise.all([fetchEvent(), fetchStats()]);
      setEvent(ev); setStats(st);
      toast.success(toastMessages[action]);
    } catch (err) {
      setActionError(toErrorMessage(err));
    } finally {
      setActionLoading(false);
    }
  }

  // ── Loading / error guards ─────────────────────────────────────────────────

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
  const showTimeline = (isActive || event.status === 'PAUSED' || event.status === 'ENDED') && event.timeline;
  const modal        = pendingAction ? MODAL_COPY[pendingAction] : null;

  return (
    <div className="animate-page-in">
      {/* ── Page header ─────────────────────────────────────────────────────── */}
      <div className="mb-6 border-b border-border-subtle pb-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold text-text-primary">{event.name}</h1>
              <Badge variant={STATUS_VARIANT[event.status]}>
                {event.status.charAt(0) + event.status.slice(1).toLowerCase()}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-text-tertiary">
              by{' '}
              <Link
                href="/admin/clients"
                className="rounded text-text-secondary transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface-base"
              >
                {event.clientEmail}
              </Link>
            </p>
          </div>

          {/* Back link */}
          <Link
            href="/admin/events"
            className="inline-flex items-center gap-1.5 rounded text-sm text-text-tertiary transition-colors hover:text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface-base"
          >
            <ArrowLeft size={14} />
            All events
          </Link>
        </div>
      </div>

      {actionError && (
        <ErrorBanner message={actionError} className="mb-6" />
      )}

      {/* ── Client Info card ────────────────────────────────────────────────── */}
      <Card
        header={
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-text-primary">Client Info</p>
            <Link
              href="/admin/clients"
              className="inline-flex items-center gap-1 rounded text-xs text-text-tertiary transition-colors hover:text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface-base"
            >
              View client
              <ExternalLink size={11} />
            </Link>
          </div>
        }
        className="mb-5"
      >
        <div className="space-y-4">
          <div>
            <p className="mb-1 text-xs font-medium text-text-secondary">Email</p>
            <p className="text-sm text-text-primary">{event.clientEmail}</p>
          </div>
          <CopyableField label="Client Public Key" value={event.clientPublicKey} />
        </div>
      </Card>

      {/* ── Admin Actions card ───────────────────────────────────────────────── */}
      <Card
        header={<p className="text-sm font-semibold text-text-primary">Admin Actions</p>}
        className="mb-6"
      >
        {event.status === 'ENDED' ? (
          <p className="text-sm text-text-tertiary">
            Event ended
            {event.endedAt && (
              <> at {new Date(event.endedAt).toLocaleString(undefined, {
                month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
              })}</>
            )}.
          </p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {event.status === 'ACTIVE' && (
              <Button
                variant="secondary"
                loading={actionLoading}
                className="border-yellow-500/30 text-yellow-400 hover:border-yellow-500/60 hover:bg-yellow-500/10"
                onClick={() => setPendingAction('pause')}
              >
                Pause Event
              </Button>
            )}

            {event.status === 'PAUSED' && (
              <>
                <Button
                  loading={actionLoading}
                  onClick={() => setPendingAction('resume')}
                >
                  Resume Event
                </Button>
                <Button
                  variant="danger"
                  loading={actionLoading}
                  onClick={() => setPendingAction('end')}
                >
                  Force End
                </Button>
              </>
            )}

            {event.status === 'PENDING' && (
              <>
                <Button
                  loading={actionLoading}
                  onClick={() => setPendingAction('activate')}
                >
                  Activate
                </Button>
                <Button
                  variant="danger"
                  loading={actionLoading}
                  onClick={() => setPendingAction('end')}
                >
                  Force End
                </Button>
              </>
            )}
          </div>
        )}
      </Card>

      {/* ── Shared sections ─────────────────────────────────────────────────── */}
      <EventStats event={event} stats={stats} isLive={isActive} />

      <div className="space-y-5">
        {showTimeline && (
          <EventTimelineCard timeline={event.timeline!} status={event.status} />
        )}
        <EventKeysCard event={event} />
        {stats?.funnel && <EventFunnelCard funnel={stats.funnel} />}
      </div>

      {/* ── Confirm modal ───────────────────────────────────────────────────── */}
      {modal && (
        <Modal
          isOpen
          onClose={() => { if (!actionLoading) setPendingAction(null); }}
          title={modal.title}
        >
          <div className="space-y-4">
            <p className="text-sm text-text-secondary">
              {modal.body(event.name)}
            </p>
            <div className="flex gap-3">
              <Button
                variant="secondary"
                onClick={() => setPendingAction(null)}
                disabled={actionLoading}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                variant={pendingAction === 'pause' ? 'secondary' : pendingAction === 'end' ? 'danger' : 'primary'}
                className={pendingAction === 'pause' ? 'flex-1 border-yellow-500/30 text-yellow-400 hover:border-yellow-500/60 hover:bg-yellow-500/10' : 'flex-1'}
                loading={actionLoading}
                onClick={() => pendingAction && runAction(pendingAction)}
              >
                {modal.confirm}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
