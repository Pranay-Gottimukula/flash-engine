import { Card } from '@/components/ui/card';
import type { FunnelStats } from './types';

function FunnelBar({
  label, count, total, colorClass,
}: {
  label:      string;
  count:      number;
  total:      number;
  colorClass: string;
}) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="w-28 shrink-0 text-xs text-text-secondary">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-overlay">
        <div
          className={`h-full rounded-full transition-[width] duration-700 ${colorClass}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-14 shrink-0 text-right font-mono text-xs text-text-primary">
        {count.toLocaleString()}
      </span>
      <span className="w-12 shrink-0 text-right text-xs text-text-tertiary">
        {total > 0 ? `${pct.toFixed(1)}%` : '—'}
      </span>
    </div>
  );
}

interface EventFunnelProps {
  funnel: FunnelStats;
}

export function EventFunnelCard({ funnel }: EventFunnelProps) {
  const rows: { label: string; count: number }[] = [
    { label: 'Total Requests', count: funnel.totalRequests },
    { label: 'Queued',         count: funnel.queued },
    { label: 'Instant Wins',   count: funnel.instantWins },
    { label: 'Sold Out',       count: funnel.soldOut },
    { label: 'Rate Limited',   count: funnel.rateLimited },
    { label: 'Won',            count: funnel.won },
    { label: 'Released',       count: funnel.released },
    { label: 'Verified',       count: funnel.verified },
  ];

  return (
    <Card header={<p className="text-sm font-semibold text-text-primary">Event Funnel</p>}>
      <div className="space-y-6">
        <div className="space-y-3">
          <FunnelBar label="Queued"   count={funnel.queued}   total={funnel.totalRequests} colorClass="bg-blue-500"   />
          <FunnelBar label="Won"      count={funnel.won}      total={funnel.totalRequests} colorClass="bg-green-600"  />
          <FunnelBar label="Verified" count={funnel.verified} total={funnel.totalRequests} colorClass="bg-accent"     />
          <FunnelBar label="Sold Out" count={funnel.soldOut}  total={funnel.totalRequests} colorClass="bg-red-500"    />
          <FunnelBar label="Released" count={funnel.released} total={funnel.totalRequests} colorClass="bg-yellow-500" />
        </div>

        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border-subtle">
              <th className="pb-2 text-left font-medium text-text-tertiary">Metric</th>
              <th className="pb-2 text-right font-medium text-text-tertiary">Count</th>
              <th className="pb-2 text-right font-medium text-text-tertiary">% of Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ label, count }) => (
              <tr key={label} className="border-b border-border-subtle/50 last:border-0">
                <td className="py-2 text-text-secondary">{label}</td>
                <td className="py-2 text-right font-mono text-text-primary">
                  {count.toLocaleString()}
                </td>
                <td className="py-2 text-right text-text-tertiary">
                  {funnel.totalRequests > 0
                    ? `${((count / funnel.totalRequests) * 100).toFixed(1)}%`
                    : '—'
                  }
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
