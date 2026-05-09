import { Card } from '@/components/ui/card';
import type { EventDetail, StatsResponse } from './types';

function StatCard({
  label, value, total, isLive,
}: {
  label:   string;
  value:   number | null;
  total?:  number;
  isLive?: boolean;
}) {
  const display = value === null ? '—' : value.toLocaleString();
  const pct     = value !== null && total ? Math.min((value / total) * 100, 100) : null;

  return (
    <Card padding={false}>
      <div className="flex flex-col gap-2.5 p-4">
        <p
          className="tabular-nums text-2xl font-bold text-text-primary"
          style={isLive ? { animation: 'stat-pulse 3s ease-in-out infinite' } : undefined}
        >
          {display}
        </p>
        {pct !== null && (
          <div className="h-1 w-full overflow-hidden rounded-full bg-surface-overlay">
            <div
              className="h-full rounded-full bg-accent/50 transition-[width] duration-1000"
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
        <p className="text-xs text-text-secondary">{label}</p>
      </div>
    </Card>
  );
}

interface EventStatsProps {
  event:  EventDetail;
  stats:  StatsResponse | null;
  isLive: boolean;
}

export function EventStats({ event, stats, isLive }: EventStatsProps) {
  const live   = stats?.live   ?? null;
  const funnel = stats?.funnel ?? null;

  return (
    <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
      <StatCard
        label="Stock Remaining"
        value={live?.stockRemaining ?? null}
        total={event.stockCount}
        isLive={isLive}
      />
      <StatCard label="Queue Depth" value={live?.queueDepth  ?? null} isLive={isLive} />
      <StatCard label="Winners"     value={funnel?.won        ?? null} isLive={isLive} />
      <StatCard label="Verified"    value={funnel?.verified   ?? null} isLive={isLive} />
    </div>
  );
}
