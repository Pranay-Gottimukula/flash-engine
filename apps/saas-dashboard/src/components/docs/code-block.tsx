'use client';

import { useState } from 'react';
import { Clipboard, Check } from 'lucide-react';
import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import tsLang     from 'react-syntax-highlighter/dist/esm/languages/prism/typescript';
import tsxLang    from 'react-syntax-highlighter/dist/esm/languages/prism/tsx';
import jsLang     from 'react-syntax-highlighter/dist/esm/languages/prism/javascript';
import jsonLang   from 'react-syntax-highlighter/dist/esm/languages/prism/json';
import pythonLang from 'react-syntax-highlighter/dist/esm/languages/prism/python';
import goLang     from 'react-syntax-highlighter/dist/esm/languages/prism/go';
import phpLang    from 'react-syntax-highlighter/dist/esm/languages/prism/php';
import markupLang from 'react-syntax-highlighter/dist/esm/languages/prism/markup';
import bashLang   from 'react-syntax-highlighter/dist/esm/languages/prism/bash';
import { cn } from '@/lib/cn';

SyntaxHighlighter.registerLanguage('typescript', tsLang);
SyntaxHighlighter.registerLanguage('tsx',        tsxLang);
SyntaxHighlighter.registerLanguage('javascript', jsLang);
SyntaxHighlighter.registerLanguage('json',       jsonLang);
SyntaxHighlighter.registerLanguage('python',     pythonLang);
SyntaxHighlighter.registerLanguage('go',         goLang);
SyntaxHighlighter.registerLanguage('php',        phpLang);
SyntaxHighlighter.registerLanguage('html',       markupLang);
SyntaxHighlighter.registerLanguage('bash',       bashLang);

// ── Language normalisation ───────────────────────────────────────────────────

const LANG_ALIASES: Record<string, string> = {
  ts:    'typescript',
  js:    'javascript',
  sh:    'bash',
  shell: 'bash',
};

const LANG_LABELS: Record<string, string> = {
  typescript: 'TypeScript',
  javascript: 'JavaScript',
  tsx:        'TSX',
  jsx:        'JSX',
  bash:       'Bash',
  json:       'JSON',
  python:     'Python',
  go:         'Go',
  php:        'PHP',
  html:       'HTML',
};

function normalizeLang(lang: string): string {
  return LANG_ALIASES[lang] ?? lang;
}

function langLabel(lang: string): string {
  return LANG_LABELS[lang] ?? lang.toUpperCase();
}

// ── Bash custom renderer ─────────────────────────────────────────────────────
// react-syntax-highlighter handles comment tokens, but we also want to colour
// the `$ ` prompt prefix in the brand accent (#22c55e) which Prism doesn't
// tokenise separately.  For bash we therefore render line-by-line ourselves.

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

function BashLine({ line }: { line: string }) {
  const trimmed = line.trimStart();
  if (!trimmed) return <>{line}</>;

  // Full-line comment
  if (trimmed.startsWith('#')) {
    return <span style={{ color: '#6272a4', fontStyle: 'italic' }}>{line}</span>;
  }

  // `$ ` prompt prefix
  if (line.startsWith('$ ')) {
    return (
      <>
        <span style={{ color: '#22c55e' }}>$</span>
        <span style={{ color: '#f8f8f2' }}>{line.slice(1)}</span>
      </>
    );
  }

  // Inline comment
  const ci = findInlineComment(line);
  if (ci > 0) {
    return (
      <>
        <span style={{ color: '#f8f8f2' }}>{line.slice(0, ci)}</span>
        <span style={{ color: '#6272a4', fontStyle: 'italic' }}>{line.slice(ci)}</span>
      </>
    );
  }

  return <span style={{ color: '#f8f8f2' }}>{line}</span>;
}

function BashCode({ code }: { code: string }) {
  const lines = code.split('\n');
  return (
    <>
      {lines.map((line, idx) => (
        <span key={idx}>
          <BashLine line={line} />
          {idx < lines.length - 1 ? '\n' : null}
        </span>
      ))}
    </>
  );
}

// ── Component ────────────────────────────────────────────────────────────────

interface CodeBlockProps {
  code:      string;
  language?: string;
  title?:    string;
  className?: string;
}

const PRISM_CUSTOM_STYLE: React.CSSProperties = {
  background:   '#1e1e1e',
  margin:        0,
  padding:      '0.75rem 1rem',
  fontSize:     '0.75rem',
  lineHeight:   '1.625',
  fontFamily:   'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  scrollbarWidth: 'none',
};

export function CodeBlock({ code, language, title, className }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const lang    = language ? normalizeLang(language) : null;
  const isBash  = lang === 'bash';
  const label   = lang ? langLabel(lang) : null;
  const showHdr = !!(title || label);

  async function handleCopy() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-lg border border-border-subtle',
        className,
      )}
      style={{ backgroundColor: '#1e1e1e' }}
    >
      {/* Header bar — language badge + optional title */}
      {showHdr && (
        <div className="flex items-center justify-between border-b border-border-subtle bg-[#171717] px-4 py-2">
          <span className="text-xs text-text-tertiary">{title ?? ''}</span>
          {label && (
            <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
              {label}
            </span>
          )}
        </div>
      )}

      {/* Code area */}
      <div className="relative syn-wrap">
        {isBash ? (
          <pre
            className="overflow-x-auto px-4 py-3 text-xs font-mono leading-relaxed [&::-webkit-scrollbar]:hidden"
            style={{ color: '#f8f8f2', scrollbarWidth: 'none', background: 'transparent', margin: 0 }}
          >
            <code><BashCode code={code} /></code>
          </pre>
        ) : (
          <SyntaxHighlighter
            language={lang ?? 'text'}
            style={vscDarkPlus}
            customStyle={PRISM_CUSTOM_STYLE}
          >
            {code}
          </SyntaxHighlighter>
        )}

        {/* Copy button */}
        <button
          onClick={handleCopy}
          aria-label={copied ? 'Copied' : 'Copy code'}
          className={cn(
            'absolute right-3 top-3 flex items-center gap-1.5 rounded-md px-2 py-1',
            'text-xs transition-colors duration-150',
            'border border-border-subtle bg-[#171717]',
            copied
              ? 'text-accent'
              : 'text-text-tertiary hover:border-border hover:text-text-secondary',
          )}
        >
          {copied ? (
            <><Check size={12} /><span>Copied!</span></>
          ) : (
            <Clipboard size={12} />
          )}
        </button>
      </div>
    </div>
  );
}
