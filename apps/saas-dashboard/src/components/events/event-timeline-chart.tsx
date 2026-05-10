'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';

// ── Types ─────────────────────────────────────────────────────────────────────

interface TimelineBucket {
  timestamp: string;
  won:       number;
  queued:    number;
  soldOut:   number;
  released:  number;
  total:     number;
}

interface TimelineResponse {
  timeline:          TimelineBucket[];
  bucketSizeSeconds: number;
}

interface ChartPoint {
  time:     string;
  total:    number;
  won:      number;
  queued:   number;
  soldOut:  number;
  released: number;
}

// ── Design tokens (matches globals.css) ───────────────────────────────────────

const C = {
  total:    '#6b6b6b',
  won:      '#22c55e',
  soldOut:  '#ef4444',
  queued:   '#60a5fa',
  released: '#facc15',
  grid:     'rgba(255,255,255,0.06)',
  axis:     '#6b6b6b',
  legend:   '#a1a1a1',
  tooltip:  '#1a1a1a',
  border:   'rgba(255,255,255,0.06)',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function toHHMMSS(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour:   '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

// ── Custom tooltip ────────────────────────────────────────────────────────────

const TOOLTIP_ROWS: { key: keyof ChartPoint; label: string; color: string }[] = [
  { key: 'total',    label: 'Total',    color: C.total    },
  { key: 'won',      label: 'Won',      color: C.won      },
  { key: 'queued',   label: 'Queued',   color: C.queued   },
  { key: 'soldOut',  label: 'Sold Out', color: C.soldOut  },
  { key: 'released', label: 'Released', color: C.released },
];

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;

  const byKey = Object.fromEntries(
    (payload as { dataKey: string; value: number }[]).map(p => [p.dataKey, p.value])
  );

  return (
    <div
      className="rounded-lg p-3 text-xs shadow-xl"
      style={{ background: C.tooltip, border: `1px solid ${C.border}` }}
    >
      <p className="mb-2 font-mono font-medium text-text-secondary">{label}</p>
      {TOOLTIP_ROWS.map(({ key, label: rowLabel, color }) => (
        <div key={key} className="flex items-center justify-between gap-6 py-0.5">
          <span className="flex items-center gap-1.5" style={{ color }}>
            <span
              className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ background: color }}
            />
            {rowLabel}
          </span>
          <span className="font-mono text-text-primary">
            {(byKey[key] ?? 0).toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

const HEADER = <p className="text-sm font-semibold text-text-primary">Activity Timeline</p>;

interface Props {
  eventId: string;
  status:  string;
}

export function EventTimelineChart({ eventId, status }: Props) {
  const [data,    setData]    = useState<ChartPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  const isActive  = status === 'ACTIVE';
  const shouldFetch = isActive || status === 'ENDED';

  const loadData = useCallback(async () => {
    try {
      const res = await api.get<TimelineResponse>(`/api/admin/events/${eventId}/timeline`);
      setData(
        res.timeline.map(b => ({
          time:     toHHMMSS(b.timestamp),
          total:    b.total,
          won:      b.won,
          queued:   b.queued,
          soldOut:  b.soldOut,
          released: b.released,
        }))
      );
    } catch (err: any) {
      setError(err.message ?? 'Failed to load timeline');
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    if (!shouldFetch) {
      setLoading(false);
      return;
    }

    loadData();

    if (!isActive) return;
    const timer = setInterval(loadData, 10_000);
    return () => clearInterval(timer);
  }, [loadData, shouldFetch, isActive]);

  if (loading) {
    return (
      <Card header={HEADER}>
        <div className="flex h-[300px] items-center justify-center">
          <Spinner />
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card header={HEADER}>
        <div className="flex h-[300px] items-center justify-center">
          <p className="text-sm text-text-tertiary">{error}</p>
        </div>
      </Card>
    );
  }

  if (data.length === 0) {
    return (
      <Card header={HEADER}>
        <div className="flex h-[300px] items-center justify-center">
          <p className="text-sm text-text-tertiary">
            Timeline data will appear once the event is activated.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card header={HEADER}>
      <div className="pt-2">
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
            <defs>
              <linearGradient id="tl-grad-total"   x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={C.total}   stopOpacity={0.15} />
                <stop offset="95%" stopColor={C.total}   stopOpacity={0}    />
              </linearGradient>
              <linearGradient id="tl-grad-won"     x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={C.won}     stopOpacity={0.2}  />
                <stop offset="95%" stopColor={C.won}     stopOpacity={0}    />
              </linearGradient>
              <linearGradient id="tl-grad-soldOut" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={C.soldOut} stopOpacity={0.15} />
                <stop offset="95%" stopColor={C.soldOut} stopOpacity={0}    />
              </linearGradient>
            </defs>

            <CartesianGrid
              strokeDasharray="3 3"
              stroke={C.grid}
              vertical={false}
            />

            <XAxis
              dataKey="time"
              tick={{ fontSize: 10, fill: C.axis }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 10, fill: C.axis }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
            />

            <Tooltip
              content={<CustomTooltip />}
              cursor={{ stroke: C.grid, strokeWidth: 1 }}
            />

            <Legend
              wrapperStyle={{ fontSize: 11, paddingTop: 16 }}
              formatter={(value: string) => (
                <span style={{ color: C.legend }}>{value}</span>
              )}
            />

            <Area
              type="monotone"
              dataKey="total"
              name="Total"
              stroke={C.total}
              strokeWidth={1.5}
              fill="url(#tl-grad-total)"
              dot={false}
              activeDot={{ r: 3, strokeWidth: 0, fill: C.total }}
            />
            <Area
              type="monotone"
              dataKey="won"
              name="Won"
              stroke={C.won}
              strokeWidth={1.5}
              fill="url(#tl-grad-won)"
              dot={false}
              activeDot={{ r: 3, strokeWidth: 0, fill: C.won }}
            />
            <Area
              type="monotone"
              dataKey="soldOut"
              name="Sold Out"
              stroke={C.soldOut}
              strokeWidth={1.5}
              fill="url(#tl-grad-soldOut)"
              dot={false}
              activeDot={{ r: 3, strokeWidth: 0, fill: C.soldOut }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
