import { type ReactNode } from 'react';
import { Info, AlertTriangle, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/cn';

type CalloutType = 'info' | 'warning' | 'danger';

interface CalloutProps {
  type:      CalloutType;
  title?:    string;
  children:  ReactNode;
  className?: string;
}

const CONFIG: Record<CalloutType, {
  icon:        typeof Info;
  border:      string;
  bg:          string;
  iconColor:   string;
  titleColor:  string;
}> = {
  info: {
    icon:       Info,
    border:     'border-l-blue-500',
    bg:         'bg-blue-500/10',
    iconColor:  'text-blue-400',
    titleColor: 'text-blue-300',
  },
  warning: {
    icon:       AlertTriangle,
    border:     'border-l-amber-400',
    bg:         'bg-amber-400/10',
    iconColor:  'text-amber-400',
    titleColor: 'text-amber-300',
  },
  danger: {
    icon:       AlertCircle,
    border:     'border-l-red-500',
    bg:         'bg-red-500/10',
    iconColor:  'text-red-400',
    titleColor: 'text-red-300',
  },
};

export function Callout({ type, title, children, className }: CalloutProps) {
  const { icon: Icon, border, bg, iconColor, titleColor } = CONFIG[type];

  return (
    <div
      className={cn(
        'rounded-r-lg border-l-2 p-4',
        border,
        bg,
        className,
      )}
    >
      <div className="flex gap-3">
        <Icon size={16} className={cn('mt-0.5 shrink-0', iconColor)} />
        <div className="flex-1 min-w-0">
          {title && (
            <p className={cn('mb-1 text-sm font-medium', titleColor)}>{title}</p>
          )}
          <div className="text-sm text-text-secondary">{children}</div>
        </div>
      </div>
    </div>
  );
}
