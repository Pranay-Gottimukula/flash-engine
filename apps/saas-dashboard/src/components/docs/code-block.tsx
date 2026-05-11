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

// Find the index of a real bash comment `#` (not inside single/double quotes).
function findInlineComment(line: string): number {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === "'" && !inDouble) { inSingle = !inSingle; continue; }
    if (ch === '"' && !inSingle) { inDouble = !inDouble; continue; }
    if (ch === '#' && !inSingle && !inDouble) return i;
  }
  return -1;
}

function renderBashLine(line: string, idx: number) {
  const trimmed = line.trimStart();

  // Empty line — preserve vertical rhythm
  if (!trimmed) {
    return <span key={idx}>{'\n'}</span>;
  }

  // Full-line comment
  if (trimmed.startsWith('#')) {
    return (
      <span key={idx} style={{ color: '#6272a4', fontStyle: 'italic' }}>{line}</span>
    );
  }

  // Prompt prefix `$ `
  if (line.startsWith('$ ')) {
    return (
      <span key={idx}>
        <span style={{ color: '#50fa7b' }}>$</span>
        <span style={{ color: '#f8f8f2' }}>{line.slice(1)}</span>
      </span>
    );
  }

  // Inline comment
  const ci = findInlineComment(line);
  if (ci > 0) {
    return (
      <span key={idx}>
        <span style={{ color: '#f8f8f2' }}>{line.slice(0, ci)}</span>
        <span style={{ color: '#6272a4', fontStyle: 'italic' }}>{line.slice(ci)}</span>
      </span>
    );
  }

  return <span key={idx} style={{ color: '#f8f8f2' }}>{line}</span>;
}

function BashCode({ code }: { code: string }) {
  const lines = code.split('\n');
  return (
    <>
      {lines.map((line, idx) => (
        <span key={idx}>
          {renderBashLine(line, idx)}
          {idx < lines.length - 1 ? '\n' : null}
        </span>
      ))}
    </>
  );
}

export function CodeBlock({ code, language, title, className }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const isBash = language === 'bash' || language === 'sh' || language === 'shell';

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
      style={{ backgroundColor: '#1e1e1e' }}
    >
      {title && (
        <div className="flex items-center border-b border-border-subtle bg-surface-raised px-4 py-2">
          <span className="text-xs text-text-tertiary">{title}</span>
        </div>
      )}

      <div className="relative">
        <pre
          className="overflow-x-auto px-4 py-3 text-xs font-mono leading-relaxed [&::-webkit-scrollbar]:hidden"
          style={{ color: '#f8f8f2', scrollbarWidth: 'none' }}
        >
          <code>
            {isBash ? <BashCode code={code} /> : code}
          </code>
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
