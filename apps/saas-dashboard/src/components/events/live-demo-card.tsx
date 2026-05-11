'use client';

import { useState } from 'react';
import { ChevronDown, ExternalLink, MonitorPlay, Terminal } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CopyableField } from '@/components/ui/copyable-field';
import type { EventDetail } from './types';

// ── Env resolution (client-side) ──────────────────────────────────────────────

const ENGINE_API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

const DEMO_CLIENT_URL =
  process.env.NEXT_PUBLIC_DEMO_CLIENT_URL ?? 'http://localhost:3001';

// ── Props ─────────────────────────────────────────────────────────────────────

interface LiveDemoCardProps {
  event: EventDetail;
  /** Base path of the simulator page. Defaults to /demo */
  simulatorPath?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function LiveDemoCard({ event, simulatorPath = '/demo' }: LiveDemoCardProps) {
  const [setupOpen, setSetupOpen] = useState(false);

  const storefrontUrl =
    `${DEMO_CLIENT_URL}?pk=${encodeURIComponent(event.publicKey)}&engine=${encodeURIComponent(ENGINE_API_URL)}`;

  const simulatorUrl =
    `${simulatorPath}?pk=${encodeURIComponent(event.publicKey)}`;

  const envFileContent = [
    `ENGINE_API_URL=${ENGINE_API_URL}`,
    `EVENT_PUBLIC_KEY=${event.publicKey}`,
    `EVENT_SIGNING_SECRET=${event.signingSecret}`,
    `PORT=4000`,
  ].join('\n');

  return (
    <Card
      header={
        <div className="flex items-center gap-2">
          <MonitorPlay size={15} className="text-accent" />
          <p className="text-sm font-semibold text-text-primary">Live Demo</p>
        </div>
      }
    >
      <div className="space-y-5">
        <p className="text-sm text-text-secondary">
          Open a simulated storefront to test the full purchase flow — queue, verify, and release.
        </p>

        {/* Primary CTA */}
        <Button
          size="lg"
          onClick={() => window.open(storefrontUrl, '_blank', 'noopener,noreferrer')}
          className="gap-2"
        >
          <ExternalLink size={15} />
          Open Demo Storefront
        </Button>

        {/* Secondary links */}
        <div className="space-y-2">
          {/* Traffic simulator */}
          <div className="flex items-center gap-2">
            <a
              href={simulatorUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded text-sm text-accent transition-colors hover:text-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface-base"
            >
              <ExternalLink size={12} />
              Open Traffic Simulator
            </a>
            <span className="text-xs text-text-tertiary">— dot-grid load test (this page)</span>
          </div>

          {/* Demo server logs — no link, just instruction */}
          <div className="flex items-start gap-2">
            <Terminal size={13} className="mt-0.5 shrink-0 text-text-tertiary" />
            <p className="text-sm text-text-tertiary">
              <span className="font-medium text-text-secondary">Demo Server Logs</span>
              {' — '}run{' '}
              <code className="rounded bg-surface-overlay px-1.5 py-0.5 font-mono text-xs text-text-primary">
                cd apps/demo/demo-server &amp;&amp; npm run dev
              </code>
              {' '}and watch terminal for verify/release logs
            </p>
          </div>
        </div>

        {/* Setup Instructions — collapsible */}
        <div className="rounded-lg border border-border-subtle">
          <button
            type="button"
            onClick={() => setSetupOpen(o => !o)}
            className="flex w-full items-center justify-between rounded-lg px-4 py-3 text-left text-sm font-medium text-text-primary transition-colors hover:bg-surface-overlay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface-base"
          >
            Setup Instructions
            <ChevronDown
              size={15}
              className="shrink-0 text-text-tertiary transition-transform duration-200"
              style={{ transform: setupOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
            />
          </button>

          {setupOpen && (
            <div className="space-y-5 border-t border-border-subtle px-4 pb-4 pt-4">
              {/* Step 1 */}
              <SetupStep n={1} title="Start the demo server">
                <p className="mb-3 text-xs text-text-secondary">
                  The demo server acts as your mock backend — it signs HMAC release requests and
                  forwards verify/checkout calls to the engine.
                </p>
                <CodeSnippet>cd apps/demo/demo-server{'\n'}cp .env.example .env</CodeSnippet>
              </SetupStep>

              {/* Step 2 */}
              <SetupStep n={2} title="Paste these values into .env">
                <p className="mb-3 text-xs text-text-secondary">
                  Copy this block directly into{' '}
                  <code className="font-mono text-xs text-text-primary">apps/demo/demo-server/.env</code>:
                </p>
                <CopyableField value={envFileContent} multiline />
              </SetupStep>

              {/* Step 3 */}
              <SetupStep n={3} title="Run the demo server">
                <CodeSnippet>npm run dev</CodeSnippet>
                <p className="mt-2 text-xs text-text-tertiary">
                  Runs on port 4000. Keep this terminal open — verify/release logs will appear here.
                </p>
              </SetupStep>

              {/* Step 4 */}
              <SetupStep n={4} title="Start the demo storefront">
                <CodeSnippet>cd apps/demo/demo-client{'\n'}npm run dev</CodeSnippet>
                <p className="mt-2 text-xs text-text-tertiary">
                  Runs on port 3001. Or use the button above — it pre-fills the public key via{' '}
                  <code className="font-mono text-xs">?pk=</code>.
                </p>
              </SetupStep>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SetupStep({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/10 font-mono text-xs font-semibold text-accent">
        {n}
      </div>
      <div className="min-w-0 flex-1">
        <p className="mb-2 text-sm font-medium text-text-primary">{title}</p>
        {children}
      </div>
    </div>
  );
}

function CodeSnippet({ children }: { children: React.ReactNode }) {
  return (
    <pre className="overflow-x-auto rounded-md bg-surface-overlay px-3 py-2.5 font-mono text-xs text-text-primary">
      {children}
    </pre>
  );
}
