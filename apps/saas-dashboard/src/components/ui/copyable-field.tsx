'use client';

import { useState } from 'react';
import { Check, ChevronDown, ChevronUp, Copy, Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/cn';

interface CopyableFieldProps {
  value:            string;
  label?:           string;
  multiline?:       boolean;
  defaultExpanded?: boolean;
  masked?:          boolean;
  mono?:            boolean;
  warning?:         string;
  className?:       string;
}

export function CopyableField({
  value,
  label,
  multiline,
  defaultExpanded = false,
  masked,
  mono = true,
  warning,
  className,
}: CopyableFieldProps) {
  const [copied,   setCopied]   = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [expanded, setExpanded] = useState(defaultExpanded);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard access denied
    }
  }

  const display = masked && !revealed ? '•'.repeat(Math.min(value.length, 48)) : value;

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label && (
        <p className="text-xs font-medium text-text-secondary">{label}</p>
      )}
      {warning && (
        <p className="flex items-center gap-1.5 text-xs text-yellow-400/80">{warning}</p>
      )}

      <div className="relative overflow-hidden rounded-lg border border-border-subtle bg-surface-base">
        {/* Action buttons pinned top-right */}
        <div className="absolute right-2 top-2 z-10 flex items-center gap-0.5">
          {masked && (
            <button
              type="button"
              onClick={() => setRevealed(r => !r)}
              className="rounded p-1.5 text-text-tertiary transition-colors hover:bg-surface-overlay hover:text-text-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
              aria-label={revealed ? 'Hide value' : 'Reveal value'}
            >
              {revealed ? <EyeOff size={13} /> : <Eye size={13} />}
            </button>
          )}
          <button
            type="button"
            onClick={copy}
            className="rounded p-1.5 text-text-tertiary transition-colors hover:bg-surface-overlay hover:text-text-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
            aria-label={copied ? 'Copied!' : 'Copy to clipboard'}
          >
            {copied
              ? <Check size={13} className="text-accent" />
              : <Copy size={13} />
            }
          </button>
        </div>

        {/* Content */}
        <div className={cn(
          'overflow-auto px-3 py-2.5 pr-16',
          multiline && !expanded && 'max-h-[5rem]',
        )}>
          <pre className={cn(
            'text-xs leading-relaxed break-all whitespace-pre-wrap text-text-primary',
            mono && 'font-mono',
            masked && !revealed && 'tracking-[0.2em] text-text-tertiary',
          )}>
            {display}
          </pre>
        </div>

        {/* Expand / collapse for multiline */}
        {multiline && (
          <button
            type="button"
            onClick={() => setExpanded(e => !e)}
            className="flex w-full items-center justify-center gap-1.5 border-t border-border-subtle py-1.5 text-xs text-text-tertiary transition-colors hover:bg-surface-overlay hover:text-text-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent focus-visible:ring-inset"
          >
            {expanded
              ? <><ChevronUp size={12} /> Collapse</>
              : <><ChevronDown size={12} /> Expand</>
            }
          </button>
        )}
      </div>
    </div>
  );
}
