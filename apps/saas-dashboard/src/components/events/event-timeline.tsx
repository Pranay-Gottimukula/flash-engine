import { Card } from '@/components/ui/card';
import type { EventStatus, EventTimeline } from './types';

function fmtTs(ts: string) {
  return new Date(ts).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function isCurrentStage(label: string, status: EventStatus): boolean {
  if (status === 'ACTIVE' && label === 'Activated') return true;
  if (status === 'ENDED'  && label === 'Ended')     return true;
  return false;
}

interface EventTimelineProps {
  timeline: EventTimeline;
  status:   EventStatus;
}

export function EventTimelineCard({ timeline, status }: EventTimelineProps) {
  const points: { label: string; ts: string | null }[] = [
    { label: 'Created',        ts: timeline.created },
    { label: 'Activated',      ts: timeline.activated },
    { label: 'First Winner',   ts: timeline.firstWinner },
    { label: 'Stock Depleted', ts: timeline.stockDepleted },
    { label: 'Last Release',   ts: timeline.lastRelease },
    { label: 'Ended',          ts: timeline.ended },
  ];

  const visible = points.filter(p => p.ts !== null);
  if (visible.length === 0) return null;

  const lastIdx = visible.length - 1;

  return (
    <Card header={<p className="text-sm font-semibold text-text-primary">Event Timeline</p>}>
      <div className="space-y-0">
        {visible.map(({ label, ts }, i) => {
          const active = isCurrentStage(label, status);
          return (
            <div key={label} className="flex gap-4">
              {/* Dot + connector line */}
              <div className="flex flex-col items-center">
                <div className={[
                  'relative z-10 mt-0.5 flex h-3 w-3 shrink-0 items-center justify-center rounded-full',
                  active
                    ? 'bg-accent'
                    : 'border border-border bg-surface-overlay',
                ].join(' ')}>
                  {active && (
                    <span className="absolute inset-0 animate-ping rounded-full bg-accent opacity-50" />
                  )}
                </div>
                {i < lastIdx && (
                  <div className="mt-1 w-px flex-1 bg-border-subtle" style={{ minHeight: 24 }} />
                )}
              </div>
              {/* Content */}
              <div className={i < lastIdx ? 'pb-5' : ''}>
                <p className={`text-sm font-medium ${active ? 'text-accent' : 'text-text-primary'}`}>
                  {label}
                </p>
                <p className="text-xs text-text-tertiary">{fmtTs(ts!)}</p>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
