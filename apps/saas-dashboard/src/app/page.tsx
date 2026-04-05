'use client';

// apps/saas-dashboard/src/app/page.tsx
//
// ──────────────────────────────────────────────────────────────────────────────
// ARCHITECTURAL OVERVIEW — Dashboard Home Page
// ──────────────────────────────────────────────────────────────────────────────
//
// This is a Next.js App Router page (RSC by default, 'use client' opted-in).
// It is the primary entry point for the B2B operator who just signed up for
// the Flash Sale Engine.  The core UX loop is:
//
//   1. Operator clicks "Create Event"
//   2. Dashboard calls POST /api/admin/events on engine-gateway
//   3. We display the pk/sk key pair once, with copy buttons
//   4. We display a ready-to-paste code snippet showing the client integration
//
// DATA FLOW NOTE:
//   This page currently calls the engine-gateway DIRECTLY from the browser
//   on localhost:4000.  For production:
//
//   Option A (Recommended — BFF pattern):
//     Create a Next.js Route Handler (src/app/api/events/route.ts) that proxies
//     the request to engine-gateway with the ADMIN_SECRET attached server-side.
//     The browser never sees the admin secret.
//
//   Option B (Simple):
//     Put engine-gateway behind an API Gateway that validates a session cookie.
//     The dashboard is just a client; auth lives at the gateway layer.
//
// STATE MACHINE:
//   idle → loading → success (keys displayed)
//                  → error   (error panel shown)
// ──────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface EventKeys {
  publicKey:  string;
  secretKey:  string;
  // TODO: Add eventId, name, status once the DB is wired up
  // eventId: string;
  // name:    string;
  // status:  'PENDING' | 'ACTIVE' | 'ENDED';
}

type PageStatus = 'idle' | 'loading' | 'success' | 'error';

// ── Constants ─────────────────────────────────────────────────────────────────

// TODO: Move this to an env var: process.env.NEXT_PUBLIC_ENGINE_URL
// Using NEXT_PUBLIC_ prefix exposes it to the browser bundle (safe for public URLs).
const ENGINE_URL = process.env.NEXT_PUBLIC_ENGINE_URL ?? 'http://localhost:4000';

// ── Page Component ────────────────────────────────────────────────────────────

export default function HomePage() {
  const [status,   setStatus]   = useState<PageStatus>('idle');
  const [keys,     setKeys]     = useState<EventKeys | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');

  // ── Handler: Create Event ─────────────────────────────────────────────────
  //
  // TODO: Add a form with name and stockCount inputs before calling this.
  //       Currently uses hardcoded defaults for the stub.
  //
  // TODO: Add CSRF protection if you're using cookie-based sessions.
  //       If using Authorization: Bearer, CSRF is not needed.

  async function handleCreateEvent() {
    setStatus('loading');
    setKeys(null);
    setErrorMsg('');

    try {
      const res = await fetch(`${ENGINE_URL}/api/admin/events`, {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          // TODO: Attach the operator's admin secret here (or use a BFF proxy).
          // 'x-admin-secret': process.env.NEXT_PUBLIC_ADMIN_SECRET — BAD!
          // Instead: use a server-side Route Handler to inject the secret.
        },
        body: JSON.stringify({
          name:       'My Flash Sale',   // TODO: source from a form field
          stockCount: 1000,              // TODO: source from a form field
          rateLimit:  50,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).error ?? `Server responded with ${res.status}`);
      }

      const data = await res.json() as EventKeys & { message: string };
      setKeys({ publicKey: data.publicKey, secretKey: data.secretKey });
      setStatus('success');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Unknown error occurred');
      setStatus('error');
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <main className="min-h-screen bg-[#09090b] text-white flex flex-col items-center justify-center px-6 font-sans">

      {/* ── Ambient background glow ─────────────────────────────────────── */}
      <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[800px] h-[500px] rounded-full bg-violet-600/20 blur-[120px]" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] rounded-full bg-indigo-500/10 blur-[100px]" />
      </div>

      {/* ── Main card ───────────────────────────────────────────────────── */}
      <section className="relative z-10 w-full max-w-xl space-y-6">

        {/* Header */}
        <div className="mb-8 text-center">
          <span className="inline-block mb-4 px-3 py-1 rounded-full text-xs font-semibold tracking-widest uppercase bg-violet-500/10 text-violet-400 border border-violet-500/20">
            Flash Sale Engine
          </span>
          <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-br from-white via-zinc-200 to-zinc-400 bg-clip-text text-transparent">
            Event Control Panel
          </h1>
          <p className="mt-3 text-sm text-zinc-400">
            Provision a flash sale event and receive your integration keys.
          </p>
        </div>

        {/* Action panel */}
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] backdrop-blur-sm p-8 shadow-2xl space-y-5">

          {/* TODO: Replace with a proper <form> with name, stockCount, rateLimit fields */}

          <button
            id="create-event-btn"
            onClick={handleCreateEvent}
            disabled={status === 'loading'}
            className="relative w-full py-3.5 rounded-xl font-semibold text-sm bg-gradient-to-r from-violet-600 to-indigo-500 hover:from-violet-500 hover:to-indigo-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 active:scale-[0.98] shadow-lg shadow-violet-700/30 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 focus:ring-offset-[#09090b]"
          >
            {status === 'loading' ? (
              <span className="flex items-center justify-center gap-2">
                <SpinnerIcon />
                Creating Event…
              </span>
            ) : (
              '⚡ Create Flash Sale Event'
            )}
          </button>

          {/* ── Success: key display ──────────────────────────────────── */}
          {status === 'success' && keys && (
            <div id="keys-panel" className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">

              <p className="text-xs text-emerald-400 font-medium flex items-center gap-1.5">
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                Event created — store your keys now. The secret key will not be shown again.
              </p>

              <KeyField label="Public Key"  value={keys.publicKey}  id="public-key"  />
              <KeyField label="Secret Key"  value={keys.secretKey}  id="secret-key"  secret />

              {/* ── Integration snippet ────────────────────────────────── */}
              {/*
               * WHY SHOW A CODE SNIPPET HERE?
               *
               * The B2B operator needs to integrate the queue endpoint into THEIR
               * own backend in under 5 minutes.  Showing the exact fetch() call
               * with their publicKey pre-populated removes all friction.
               *
               * SECURITY NOTE:
               *   The snippet uses X-Public-Key (not X-Secret-Key).
               *   The publicKey is purposefully safe to embed in the operator's
               *   frontend/backend — it only identifies the event, it does not
               *   authenticate the operator or authorize any admin action.
               *
               * TODO: When you add real form inputs, replace the hardcoded
               *       "My Flash Sale" and 1000 with the actual values.
               */}
              <div className="mt-2 space-y-2">
                <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest">
                  Integration Snippet — paste into your backend
                </p>
                <pre
                  id="integration-snippet"
                  className="rounded-lg bg-black/60 border border-white/[0.06] p-4 text-[11px] font-mono text-emerald-300 overflow-x-auto leading-relaxed whitespace-pre"
                >
{`// Your backend (Node, Python, Go — any language)
// Call this when a user clicks "Join Sale" in your UI.

const response = await fetch('${ENGINE_URL}/api/queue/join', {
  method:  'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Public-Key': '${keys.publicKey}',  // safe to use here
    // ⚠️  NEVER send X-Secret-Key from the browser.
    //     The secret key is only for server-to-server verify calls.
  },
  body: JSON.stringify({
    publicKey: '${keys.publicKey}',
    userId:    '<YOUR_USER_ID>',   // your internal user identifier
  }),
});

const { result, token } = await response.json();

if (result === 'WON') {
  // Token is a signed JWT valid for 15 minutes.
  // Pass it to your checkout flow and call:
  //   POST ${ENGINE_URL}/api/queue/verify
  //   Headers: { 'X-Secret-Key': '<YOUR_SECRET_KEY>' }
  //   Body:    { token }
  // to atomically consume the ticket.
}

// result values:
//   'WON'          → user got a ticket (token is set)
//   'SOLD_OUT'     → no stock left (HTTP 410)
//   'RATE_LIMITED' → too many requests (HTTP 429, retry after ~1s)
//   'EVENT_NOT_ACTIVE' → sale hasn't started or has ended (HTTP 403)`}
                </pre>

                {/*
                 * TODO: Add a "Copy Snippet" button using the Clipboard API,
                 *       similar to the KeyField copy button pattern below.
                 */}
              </div>
            </div>
          )}

          {/* ── Error ─────────────────────────────────────────────────── */}
          {status === 'error' && (
            <div id="error-panel" className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
              <span className="font-medium">Error: </span>{errorMsg}
            </div>
          )}
        </div>

        <p className="text-center text-xs text-zinc-600">
          Keys are ephemeral — copy them immediately after creation.
        </p>
      </section>
    </main>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

/**
 * KeyField
 *
 * Displays a key value with copy-to-clipboard and optional reveal toggle.
 *
 * TODO: Extract to src/components/KeyField.tsx once there are more pages
 *       that need to display keys (e.g., a key-rotation page).
 */
function KeyField({
  label,
  value,
  id,
  secret = false,
}: {
  label:   string;
  value:   string;
  id:      string;
  secret?: boolean;
}) {
  const [revealed, setRevealed] = useState(!secret);
  const [copied,   setCopied]   = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="rounded-lg bg-black/40 border border-white/[0.06] p-3">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[11px] font-semibold tracking-widest uppercase text-zinc-500">
          {label}
        </span>
        <div className="flex items-center gap-2">
          {secret && (
            <button
              onClick={() => setRevealed(r => !r)}
              className="text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              {revealed ? 'Hide' : 'Reveal'}
            </button>
          )}
          <button
            id={`copy-${id}`}
            onClick={handleCopy}
            className="text-[11px] text-violet-400 hover:text-violet-300 transition-colors font-medium"
          >
            {copied ? '✓ Copied' : 'Copy'}
          </button>
        </div>
      </div>
      <code
        id={id}
        className="block text-xs font-mono text-zinc-300 break-all leading-5"
      >
        {revealed ? value : '•'.repeat(Math.min(value.length, 48))}
      </code>
    </div>
  );
}

function SpinnerIcon() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path  className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 100 16v-4l-3 3 3 3v-4a8 8 0 01-8-8z" />
    </svg>
  );
}
