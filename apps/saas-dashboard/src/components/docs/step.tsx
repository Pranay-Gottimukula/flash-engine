import { type ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface StepProps {
  number:    number;
  title:     string;
  children:  ReactNode;
  className?: string;
}

export function Step({ number, title, children, className }: StepProps) {
  return (
    <div className={cn('docs-step flex gap-4', className)}>
      {/* Circle */}
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-white">
        {number}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1 pt-0.5">
        <p className="mb-3 text-sm font-medium text-text-primary">{title}</p>
        <div className="text-sm text-text-secondary">{children}</div>
      </div>
    </div>
  );
}
