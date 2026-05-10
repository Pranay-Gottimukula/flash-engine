import { type ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface ProseProps {
  children:   ReactNode;
  className?: string;
}

export function Prose({ children, className }: ProseProps) {
  return (
    <div className={cn('docs-prose', className)}>
      {children}
    </div>
  );
}
