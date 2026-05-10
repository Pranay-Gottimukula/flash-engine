import { PageHeader } from '@/components/layout/page-header';
import { Prose }       from '@/components/docs/prose';
import { CodeBlock }   from '@/components/docs/code-block';
import { Callout }     from '@/components/docs/callout';

/* ── Code constants ──────────────────────────────────────────────────────── */

const INSTALL_CODE = `\
# npm
npm install @flashengine/browser

# yarn
yarn add @flashengine/browser

# pnpm
pnpm add @flashengine/browser`;

const CDN_CODE = `\
<script src="https://cdn.flashengine.dev/browser/latest/flashengine.umd.js"></script>`;

const CONSTRUCTOR_CODE = `\
import { FlashQueue } from '@flashengine/browser';

const queue = new FlashQueue({
  publicKey: 'pub_live_abc123',
  userId: 'user_789',
  // Optional:
  apiUrl: 'https://api.flashengine.dev',
  pollIntervalMs: 2000,
  maxPollRetries: 100,
  debug: false,
});`;

const EV_QUEUED = `\
queue.on('queued', ({ position, estimatedWaitMs }) => {
  const wait = Math.round(estimatedWaitMs / 1000);
  updateUI(\`You're #\${position} in line (~\${wait}s)\`);
});`;

const EV_POSITION = `\
queue.on('position', ({ position, estimatedWaitMs }) => {
  updatePositionDisplay(position, estimatedWaitMs);
});`;

const EV_WON = `\
queue.on('won', ({ token, expiresAt }) => {
  // expiresAt is a Unix timestamp (seconds)
  window.location.href = \`/checkout?token=\${token}\`;
});`;

const EV_SOLD_OUT = `\
queue.on('sold_out', () => {
  showSoldOutBanner();
});`;

const EV_PAUSED = `\
queue.on('paused', ({ retryAfter }) => {
  // SDK retries automatically — you can show a countdown
  showMessage(\`Sale paused. Resuming in \${retryAfter}s...\`);
});`;

const EV_EXPIRING = `\
queue.on('ticket_expiring', ({ token, expiresInMs }) => {
  const seconds = Math.round(expiresInMs / 1000);
  showUrgencyBanner(\`Complete checkout in \${seconds}s or lose your spot\`);
});`;

const EV_ERROR = `\
queue.on('error', ({ code, message }) => {
  if (code === 'EVENT_NOT_ACTIVE') {
    showMessage('The sale has ended.');
  } else {
    showErrorMessage(message);
  }
});`;

const REACT_HOOK_CODE = `\
import { useFlashQueue } from '@flashengine/browser/react';

function FlashSaleButton({ eventPublicKey, userId }) {
  const {
    status,           // QueueState
    position,         // number | null
    estimatedWaitMs,  // number | null
    token,            // string | null
    error,            // { code, message } | null
    ticketExpiring,   // boolean
    join,             // () => void
    destroy,          // () => void
  } = useFlashQueue({
    publicKey: eventPublicKey,
    userId,
    autoJoin: false,
  });

  // ... render based on status
}`;

const SCRIPT_TAG_CODE = `\
<script src="https://cdn.flashengine.dev/browser/latest/flashengine.umd.js"></script>
<script>
  const { FlashQueue } = FlashEngine;

  const queue = new FlashQueue({
    publicKey: 'YOUR_PUBLIC_KEY',
    userId: 'user_123',
  });

  queue.on('won', ({ token }) => {
    window.location.href = '/checkout?token=' + token;
  });

  queue.join();
</script>`;

/* ── Section heading helpers ─────────────────────────────────────────────── */

function SectionH2({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="mb-4 mt-10 border-b border-border-subtle pb-2 text-xl font-semibold text-text-primary">
      {children}
    </h2>
  );
}

function SectionH3({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-3 mt-8 text-lg font-medium text-text-primary">
      {children}
    </h3>
  );
}

/* ── Event entry ─────────────────────────────────────────────────────────── */

interface EventEntryProps {
  name:    string;
  payload: string;
  summary: string;
  note?:   string;
  code:    string;
}

function EventEntry({ name, payload, summary, note, code }: EventEntryProps) {
  return (
    <div className="border-b border-border-subtle py-6 last:border-0 last:pb-0">
      <div className="mb-1.5 flex flex-wrap items-baseline gap-2">
        <code className="font-mono text-sm font-semibold text-accent">{name}</code>
        <span className="text-xs text-text-tertiary">— {summary}</span>
      </div>
      <p className="mb-3 font-mono text-xs text-text-tertiary">
        Payload: {payload}
      </p>
      {note && (
        <p className="mb-3 text-sm text-text-secondary">{note}</p>
      )}
      <CodeBlock code={code} language="ts" />
    </div>
  );
}

/* ── Method entry ────────────────────────────────────────────────────────── */

interface MethodEntryProps {
  signature:   string;
  returns:     string;
  description: string;
}

function MethodEntry({ signature, returns, description }: MethodEntryProps) {
  return (
    <div className="border-b border-border-subtle py-5 last:border-0 last:pb-0">
      <div className="mb-1 flex flex-wrap items-baseline gap-3">
        <code className="font-mono text-sm font-semibold text-accent">{signature}</code>
        <span className="font-mono text-xs text-text-tertiary">→ {returns}</span>
      </div>
      <p className="text-sm text-text-secondary">{description}</p>
    </div>
  );
}

/* ── Page ────────────────────────────────────────────────────────────────── */

export default function BrowserSdkPage() {
  return (
    <div className="animate-page-in">
      <PageHeader
        title="Browser SDK Reference"
        description="@flashengine/browser — Client-side queue integration"
      />

      {/* Installation */}
      <SectionH2>Installation</SectionH2>
      <CodeBlock code={INSTALL_CODE} language="bash" />
      <Prose>
        <p>
          No bundler? Use the UMD build via a script tag (see{' '}
          <a href="#script-tag">Script Tag Usage</a> below):
        </p>
      </Prose>
      <CodeBlock code={CDN_CODE} language="html" />

      {/* FlashQueue */}
      <SectionH2>FlashQueue</SectionH2>
      <Prose>
        <p>
          The main class. Create one instance per flash sale event. Each{' '}
          <code>FlashQueue</code> instance manages its own polling loop,
          listeners, and state machine.
        </p>
      </Prose>
      <CodeBlock code={CONSTRUCTOR_CODE} language="ts" />

      <SectionH3>Constructor Options</SectionH3>
      <div className="overflow-x-auto rounded-lg border border-border-subtle">
        <Prose>
          <table>
            <thead>
              <tr>
                <th>Option</th>
                <th>Type</th>
                <th>Default</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><code>publicKey</code></td>
                <td><code>string</code></td>
                <td>required</td>
                <td>Your event&apos;s public key</td>
              </tr>
              <tr>
                <td><code>userId</code></td>
                <td><code>string</code></td>
                <td>required</td>
                <td>Your user&apos;s unique identifier</td>
              </tr>
              <tr>
                <td><code>apiUrl</code></td>
                <td><code>string</code></td>
                <td><code>https://api.flashengine.dev</code></td>
                <td>FlashEngine API base URL</td>
              </tr>
              <tr>
                <td><code>pollIntervalMs</code></td>
                <td><code>number</code></td>
                <td><code>2000</code></td>
                <td>
                  Polling interval in milliseconds. The server may override
                  this value based on load.
                </td>
              </tr>
              <tr>
                <td><code>maxPollRetries</code></td>
                <td><code>number</code></td>
                <td><code>100</code></td>
                <td>Max poll attempts before emitting a POLL_TIMEOUT error</td>
              </tr>
              <tr>
                <td><code>debug</code></td>
                <td><code>boolean</code></td>
                <td><code>false</code></td>
                <td>Log internal state transitions to the console</td>
              </tr>
            </tbody>
          </table>
        </Prose>
      </div>

      {/* Events */}
      <SectionH2>Events</SectionH2>
      <Prose>
        <p>
          Listen for events with <code>queue.on(eventName, handler)</code>.
          All handlers receive a typed payload object.
        </p>
      </Prose>
      <div className="mt-2">
        <EventEntry
          name="queued"
          payload="{ position: number, estimatedWaitMs: number }"
          summary="User is in the queue"
          note="Fires once when the user has been placed in the queue."
          code={EV_QUEUED}
        />
        <EventEntry
          name="position"
          payload="{ position: number, estimatedWaitMs: number }"
          summary="Queue position updated"
          note="Fires on every poll while the user is queued."
          code={EV_POSITION}
        />
        <EventEntry
          name="won"
          payload="{ token: string, expiresAt: number }"
          summary="User won a spot"
          note="Token is a signed JWT. Pass it to your checkout server for verification. expiresAt is a Unix timestamp in seconds."
          code={EV_WON}
        />
        <EventEntry
          name="sold_out"
          payload="(none)"
          summary="No more stock available"
          code={EV_SOLD_OUT}
        />
        <EventEntry
          name="paused"
          payload="{ retryAfter: number }"
          summary="Sale temporarily paused by admin"
          note="The SDK automatically retries after retryAfter seconds. You can use this event to show a countdown."
          code={EV_PAUSED}
        />
        <EventEntry
          name="ticket_expiring"
          payload="{ token: string, expiresInMs: number }"
          summary="Token expiring soon"
          note="Fires 60 seconds before the token expires. Show urgency UI to prompt the user to complete checkout."
          code={EV_EXPIRING}
        />
        <EventEntry
          name="error"
          payload="{ code: string, message: string }"
          summary="Something went wrong"
          note="Error codes: NETWORK_ERROR, EVENT_NOT_FOUND, EVENT_NOT_ACTIVE, POLL_TIMEOUT, UNKNOWN"
          code={EV_ERROR}
        />
      </div>

      {/* Methods */}
      <SectionH2>Methods</SectionH2>
      <div className="mt-2">
        <MethodEntry
          signature="join()"
          returns="Promise&lt;void&gt;"
          description="Joins the queue. Can only be called once per instance. Resolves after the initial queue position is received."
        />
        <MethodEntry
          signature="destroy()"
          returns="void"
          description="Stops the polling loop, aborts any in-flight requests, and removes all event listeners. Call this on component unmount to prevent memory leaks."
        />
        <MethodEntry
          signature="currentState"
          returns="QueueState"
          description="Getter returning the current state of the queue instance: idle | joining | queued | won | sold_out | paused | error | destroyed"
        />
      </div>

      {/* React Hook */}
      <SectionH2>React Hook: useFlashQueue</SectionH2>
      <Prose>
        <p>
          Import from <code>@flashengine/browser/react</code> for a
          hook-based API that integrates with React&apos;s lifecycle.
        </p>
      </Prose>
      <CodeBlock code={REACT_HOOK_CODE} language="tsx" />
      <Callout type="info" className="mt-4">
        The React hook calls <code className="rounded bg-surface px-1.5 py-0.5 font-mono text-xs text-accent">destroy()</code> on unmount automatically. You don&apos;t need cleanup effects.
      </Callout>

      {/* Script Tag */}
      <SectionH2 id="script-tag">Script Tag Usage</SectionH2>
      <Prose>
        <p>
          For storefronts without a bundler, load the UMD build from the CDN.
          The global <code>FlashEngine</code> object is available immediately
          after the script loads.
        </p>
      </Prose>
      <CodeBlock code={SCRIPT_TAG_CODE} language="html" />

      {/* Advanced */}
      <SectionH2>Advanced: Visibility Handling</SectionH2>
      <Prose>
        <p>
          The SDK automatically pauses polling when the browser tab is hidden
          (using the Page Visibility API) and resumes when the tab becomes
          visible again. This reduces unnecessary requests to your event
          server when the user has switched away.
        </p>
        <p>
          No configuration is required — visibility handling is enabled by
          default and works transparently. The queue position is
          re-synchronized immediately when the tab regains focus.
        </p>
      </Prose>
    </div>
  );
}
