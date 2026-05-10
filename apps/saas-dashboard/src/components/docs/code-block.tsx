'use client';

import { useState } from 'react';
import { Clipboard, Check } from 'lucide-react';
import { cn } from '@/lib/cn';

interface CodeBlockProps {
  code:      string;
  language?: string;
  title?:    string;
  className?: string;
}

export function CodeBlock({ code, title, className }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div
      className={cn(
        'relative rounded-lg border border-border-subtle overflow-hidden',
        className,
      )}
      style={{ backgroundColor: '#0d0d0d' }}
    >
      {title && (
        <div className="flex items-center border-b border-border-subtle bg-surface-raised px-4 py-2">
          <span className="text-xs text-text-tertiary">{title}</span>
        </div>
      )}

      <div className="relative">
        <pre className="overflow-x-auto px-4 py-3 text-xs font-mono leading-relaxed text-accent">
          <code>{code}</code>
        </pre>

        <button
          onClick={handleCopy}
          aria-label={copied ? 'Copied' : 'Copy code'}
          className={cn(
            'absolute right-3 top-3 flex items-center gap-1.5 rounded-md px-2 py-1',
            'text-xs transition-colors duration-150',
            'border border-border-subtle bg-surface-raised',
            copied
              ? 'text-accent'
              : 'text-text-tertiary hover:text-text-secondary hover:border-border',
          )}
        >
          {copied ? (
            <>
              <Check size={12} />
              <span>Copied!</span>
            </>
          ) : (
            <Clipboard size={12} />
          )}
        </button>
      </div>
    </div>
  );
}
