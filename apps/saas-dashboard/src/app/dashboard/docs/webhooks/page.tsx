import { PageHeader } from '@/components/layout/page-header';
import { Prose }       from '@/components/docs/prose';
import { CodeBlock }   from '@/components/docs/code-block';
import { Callout }     from '@/components/docs/callout';

/* ── Code constants ──────────────────────────────────────────────────────── */

const BASE_PAYLOAD = `\
{
  "event":     "activated",
  "eventId":   "clxyz...",
  "publicKey": "pub_live_abc123",
  "timestamp": "2024-01-15T10:00:00.000Z"
}`;

const STOCK_RELEASED_PAYLOAD = `\
{
  "event":     "stock_released",
  "eventId":   "clxyz...",
  "publicKey": "pub_live_abc123",
  "timestamp": "2024-01-15T10:04:21.000Z",
  "jti":       "jti_xyz123",
  "reason":    "PAYMENT_FAILED"
}`;

const ENDPOINT_CODE = `\
app.post('/webhooks/flashengine', (req, res) => {
  const { event, eventId, publicKey, timestamp } = req.body;

  switch (event) {
    case 'stock_released': {
      const { jti, reason } = req.body;
      console.log(\`Ticket \${jti} released: \${reason}\`);
      break;
    }
    case 'ended':
      console.log(\`Sale \${eventId} ended\`);
      break;
  }

  res.status(200).send('OK');
});`;

/* ── Helpers ─────────────────────────────────────────────────────────────── */

function SectionH2({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-4 mt-10 border-b border-border-subtle pb-2 text-xl font-semibold text-text-primary">
      {children}
    </h2>
  );
}

/* ── Page ────────────────────────────────────────────────────────────────── */

export default function WebhooksPage() {
  return (
    <div className="animate-page-in">
      <PageHeader
        title="Webhooks"
        description="Receive real-time notifications for event lifecycle changes"
      />

      {/* Overview */}
      <SectionH2>Overview</SectionH2>
      <Prose>
        <p>
          FlashEngine sends HTTP POST requests to your{' '}
          <code>webhookUrl</code> when event lifecycle changes happen. Set
          the URL when creating an event in the dashboard.
        </p>
        <ul>
          <li>
            All webhooks are fire-and-forget — your endpoint should return{' '}
            <code>200</code> quickly
          </li>
          <li>
            If your endpoint is down, the webhook is lost (retry delivery is
            on the roadmap)
          </li>
          <li>
            Design your handler to be idempotent — duplicate delivery may
            occur in future versions
          </li>
        </ul>
      </Prose>

      {/* Webhook Payload */}
      <SectionH2>Webhook Payload</SectionH2>
      <Prose>
        <p>
          All webhook payloads share a common base structure. Some event
          types include additional fields.
        </p>
      </Prose>
      <CodeBlock code={BASE_PAYLOAD} language="json" />

      <div className="mt-6 overflow-x-auto rounded-lg border border-border-subtle">
        <Prose>
          <table>
            <thead>
              <tr>
                <th>Field</th>
                <th>Type</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><code>event</code></td>
                <td><code>string</code></td>
                <td>Event type — see Event Types below</td>
              </tr>
              <tr>
                <td><code>eventId</code></td>
                <td><code>string</code></td>
                <td>Internal ID of your flash sale event</td>
              </tr>
              <tr>
                <td><code>publicKey</code></td>
                <td><code>string</code></td>
                <td>The event&apos;s public key — use this to identify which event triggered the webhook</td>
              </tr>
              <tr>
                <td><code>timestamp</code></td>
                <td><code>string</code></td>
                <td>ISO 8601 timestamp of when the event occurred</td>
              </tr>
            </tbody>
          </table>
        </Prose>
      </div>

      {/* Event Types */}
      <SectionH2>Event Types</SectionH2>
      <div className="overflow-x-auto rounded-lg border border-border-subtle">
        <Prose>
          <table>
            <thead>
              <tr>
                <th>Type</th>
                <th>Description</th>
                <th>Extra Fields</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><code>activated</code></td>
                <td>Event went live — queue is accepting users</td>
                <td>—</td>
              </tr>
              <tr>
                <td><code>ended</code></td>
                <td>Event ended, no more queue processing</td>
                <td>—</td>
              </tr>
              <tr>
                <td><code>paused</code></td>
                <td>Event temporarily paused by an admin</td>
                <td>—</td>
              </tr>
              <tr>
                <td><code>resumed</code></td>
                <td>Event resumed after a pause</td>
                <td>—</td>
              </tr>
              <tr>
                <td><code>stock_released</code></td>
                <td>A ticket was returned to the pool</td>
                <td><code>jti</code>, <code>reason</code></td>
              </tr>
            </tbody>
          </table>
        </Prose>
      </div>

      <h3 className="mb-3 mt-8 text-lg font-medium text-text-primary">
        stock_released payload
      </h3>
      <Prose>
        <p>
          When a ticket is released, the webhook includes the ticket ID and
          the reason it was returned. Reason values match the{' '}
          <code>releaseTicket</code> API:{' '}
          <code>PAYMENT_FAILED</code>, <code>CANCELLED</code>,{' '}
          <code>EXPIRED</code>.
        </p>
      </Prose>
      <CodeBlock code={STOCK_RELEASED_PAYLOAD} language="json" />

      {/* Setting Up Your Endpoint */}
      <SectionH2>Setting Up Your Endpoint</SectionH2>
      <Prose>
        <p>Your webhook endpoint must:</p>
        <ul>
          <li>
            Accept <code>POST</code> requests with{' '}
            <code>Content-Type: application/json</code>
          </li>
          <li>Return <code>200</code> within 5 seconds (connection timeout)</li>
          <li>
            Be idempotent — you may receive the same webhook more than once
            in future versions
          </li>
        </ul>
      </Prose>
      <CodeBlock
        code={ENDPOINT_CODE}
        language="ts"
        title="Express webhook handler"
      />
      <Callout type="warning" className="mt-4">
        Webhooks are not signed in the current version. Verify the request
        IP or add your own authentication layer (e.g. a shared secret in the
        URL path) if needed. Signed webhooks are on the roadmap.
      </Callout>

      {/* Testing */}
      <SectionH2>Testing Webhooks</SectionH2>
      <Prose>
        <p>
          To test webhooks against your local server:
        </p>
        <ul>
          <li>
            Use a tunneling tool like{' '}
            <a href="https://ngrok.com" target="_blank" rel="noopener">
              ngrok
            </a>{' '}
            to expose a public URL pointing at your local port
          </li>
          <li>
            Set <code>webhookUrl</code> to the ngrok URL when creating the
            event in the dashboard
          </li>
          <li>
            Activate or end the event from the dashboard — the webhook fires
            within a second of the state change
          </li>
          <li>
            Check your server logs or the ngrok inspector at{' '}
            <code>http://localhost:4040</code> to see the raw request
          </li>
        </ul>
      </Prose>
    </div>
  );
}
