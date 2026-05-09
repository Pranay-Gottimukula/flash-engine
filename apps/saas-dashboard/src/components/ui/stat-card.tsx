'use client';

import { ArrowDown, ArrowUp, Minus } from 'lucide-react';
import { cn } from '@/lib/cn';

interface StatCardProps {
  label:      string;
  value:      string | number;
  subtitle?:  string;
  trend?:     'up' | 'down' | 'neutral';
  live?:      boolean;
  className?: string;
}

export function StatCard({ label, value, subtitle, trend, live, className }: StatCardProps) {
  return (
    <div className={cn(
      'rounded-lg border border-border-subtle bg-surface-raised p-5',
      className,
    )}>
      <p className="text-sm text-text-secondary">{label}</p>

      <div className="mt-2 flex items-center gap-2">
        <span className="text-3xl font-bold text-text-primary">{value}</span>
        {live && (
          <span
            className="inline-block h-2 w-2 shrink-0 rounded-full bg-accent"
            style={{ animation: 'stat-pulse 2s ease-in-out infinite' }}
            aria-label="Live"
          />
        )}
      </div>

      {(trend || subtitle) && (
        <div className="mt-1.5 flex items-center gap-1">
          {trend === 'up'      && <ArrowUp    size={13} className="shrink-0 text-green-400" />}
          {trend === 'down'    && <ArrowDown  size={13} className="shrink-0 text-red-400" />}
          {trend === 'neutral' && <Minus      size={13} className="shrink-0 text-text-tertiary" />}
          {subtitle && (
            <span className={cn(
              'text-xs',
              trend === 'up'      ? 'text-green-400'    :
              trend === 'down'    ? 'text-red-400'       :
              trend === 'neutral' ? 'text-text-tertiary' :
                                    'text-text-secondary',
            )}>
              {subtitle}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
