import { type ReactNode } from 'react';
import { PageHeader } from '@/components/layout/page-header';
import { Prose }       from '@/components/docs/prose';
import { CodeBlock }   from '@/components/docs/code-block';
import { Callout }     from '@/components/docs/callout';
import { cn }          from '@/lib/cn';

/* ── Curl / JSON examples ────────────────────────────────────────────────── */

const JOIN_CURL = `\
curl -X POST https://api.flashengine.dev/api/queue/join \\
  -H "Content-Type: application/json" \\
  -d '{"publicKey":"pub_live_abc123","userId":"user_789"}'`;

const JOIN_RES_WON = `\
// 200 — user won a spot
{
  "status":    "WON",
  "token":     "eyJhbGciOiJSUzI1NiJ9...",
  "expiresAt": 1703001200
}`;

const JOIN_RES_QUEUED = `\
// 202 — user is in the queue
{
  "status":          "QUEUED",
  "position":        42,
  "estimatedWaitMs": 84000
}`;

const STATUS_CURL = `\
curl "https://api.flashengine.dev/api/queue/status?pk=pub_live_abc123&userId=user_789"`;

const STATUS_RES = `\
{
  "status":          "QUEUED",
  "position":        12,
  "estimatedWaitMs": 24000
}`;

const INFO_CURL = `\
curl "https://api.flashengine.dev/api/queue/info?pk=pub_live_abc123"`;

const INFO_RES = `\
{
  "status":          "ACTIVE",
  "queueLength":     1200,
  "rateLimit":       50,
  "stockRemaining":  300,
  "estimatedWaitMs": 24000
}`;

const VERIFY_CURL = `\
curl -X POST https://api.flashengine.dev/api/queue/verify \\
  -H "Content-Type: application/json" \\
  -H "x-public-key: pub_live_abc123" \\
  -d '{"token":"eyJhbGciOiJSUzI1NiJ9..."}'`;

const VERIFY_RES = `\
{
  "valid":   true,
  "userId":  "user_789",
  "eventId": "evt_abc456",
  "jti":     "jti_xyz123"
}`;

const RELEASE_CURL = `\
BODY='{"jti":"jti_xyz123","reason":"PAYMENT_FAILED"}'
TIMESTAMP="$(( $(date +%s) * 1000 ))"
SECRET="your_signing_secret"

SIG=$(printf '%s' "\${TIMESTAMP}.\${BODY}" | \\
  openssl dgst -sha256 -hmac "\${SECRET}" | awk '{print $NF}')

curl -X POST https://api.flashengine.dev/api/queue/release \\
  -H "Content-Type: application/json" \\
  -H "x-public-key: pub_live_abc123" \\
  -H "x-timestamp: \${TIMESTAMP}" \\
  -H "x-signature: sha256=\${SIG}" \\
  -d "\${BODY}"`;

const RELEASE_RES = `\
{
  "released":      true,
  "stockRestored": 1
}`;

const JWKS_CURL = `\
curl "https://api.flashengine.dev/api/.well-known/jwks/pub_live_abc123"`;

const JWKS_RES = `\
{
  "keys": [
    {
      "kty": "RSA",
      "use": "sig",
      "kid": "pub_live_abc123",
      "n":   "0vx7agoebGcQSuuPiLJXZptN9nndrQmbXEps2aiAFbWhM78LjR0uj...",
      "e":   "AQAB"
    }
  ]
}`;

const JWT_PAYLOAD = `\
{
  "jti": "jti_xyz123",      // unique token ID (used as idempotency key)
  "sub": "user_789",        // your userId
  "pk":  "pub_live_abc123", // event public key
  "eid": "evt_abc456",      // event ID
  "exp": 1703001200         // Unix timestamp (seconds)
}`;

/* ── Local helpers ───────────────────────────────────────────────────────── */

function MethodBadge({ method }: { method: 'GET' | 'POST' }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded px-2 py-0.5 font-mono text-xs font-bold',
        method === 'GET'
          ? 'border border-blue-500/20 bg-blue-500/10 text-blue-400'
          : 'border border-accent/20 bg-accent-muted text-accent',
      )}
    >
      {method}
    </span>
  );
}

function SectionH2({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-4 mt-10 border-b border-border-subtle pb-2 text-xl font-semibold text-text-primary">
      {children}
    </h2>
  );
}

function SubHeading({ children }: { children: ReactNode }) {
  return (
    <h4 className="mb-2 mt-5 text-xs font-medium uppercase tracking-wider text-text-tertiary">
      {children}
    </h4>
  );
}

function EndpointBlock({
  method,
  path,
  description,
  auth,
  rateLimit,
  children,
}: {
  method:       'GET' | 'POST';
  path:         string;
  description:  string;
  auth:         string;
  rateLimit?:   string;
  children:     ReactNode;
}) {
  return (
    <div className="border-t border-border-subtle pt-8">
      <div className="mb-2 flex flex-wrap items-center gap-3">
        <MethodBadge method={method} />
        <code className="font-mono text-sm text-text-primary">{path}</code>
      </div>
      <p className="mb-2 text-sm text-text-secondary">{description}</p>
      <div className="mb-6 flex flex-wrap gap-4 text-xs text-text-tertiary">
        <span>Auth: {auth}</span>
        {rateLimit && <span>Rate limit: {rateLimit}</span>}
      </div>
      {children}
    </div>
  );
}

function APITable({ headers, children }: { headers: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border-subtle">
      <Prose>
        <table>
          <thead>
            <tr>
              {headers.map(h => <th key={h}>{h}</th>)}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </Prose>
    </div>
  );
}

/* ── Page ────────────────────────────────────────────────────────────────── */

export default function ApiReferencePage() {
  return (
    <div className="animate-page-in">
      <PageHeader
        title="API Reference"
        description="Raw HTTP endpoints for direct integration without SDKs"
      />

      {/* Base URL */}
      <SectionH2>Base URL</SectionH2>
      <div className="rounded-lg border border-border-subtle bg-surface-raised px-4 py-3">
        <code className="font-mono text-sm text-text-primary">
          https://api.flashengine.dev
        </code>
        <span className="ml-2 text-xs text-text-tertiary">
          (or your self-hosted URL)
        </span>
      </div>
      <Callout type="info" className="mt-4">
        All queue endpoints (join, status, info) hit Redis only — no database
        queries. Expected latency is under 5ms.
      </Callout>

      {/* ── Queue Endpoints ── */}
      <SectionH2>Queue Endpoints</SectionH2>

      {/* POST /api/queue/join */}
      <EndpointBlock
        method="POST"
        path="/api/queue/join"
        description="Join a flash sale queue. Returns immediately with the user's status — either WON (token issued) or QUEUED (position in line)."
        auth="None (public)"
        rateLimit="5 requests / 10 seconds per IP"
      >
        <SubHeading>Request Body</SubHeading>
        <APITable headers={['Field', 'Type', 'Description']}>
          <tr>
            <td><code>publicKey</code></td>
            <td><code>string</code></td>
            <td>Your event&apos;s public key</td>
          </tr>
          <tr>
            <td><code>userId</code></td>
            <td><code>string</code></td>
            <td>Your user&apos;s unique identifier</td>
          </tr>
        </APITable>

        <SubHeading>Responses</SubHeading>
        <APITable headers={['Status', 'Code', 'Description']}>
          <tr><td><code>200</code></td><td><code>WON</code></td><td>User won a spot — token included in response</td></tr>
          <tr><td><code>202</code></td><td><code>QUEUED</code></td><td>User is in the queue — position and wait estimate included</td></tr>
          <tr><td><code>200</code></td><td><code>SOLD_OUT</code></td><td>No stock remaining</td></tr>
          <tr><td><code>200</code></td><td><code>ALREADY_JOINED</code></td><td>This userId already has an active queue entry</td></tr>
          <tr><td><code>503</code></td><td><code>PAUSED</code></td><td>Event is temporarily paused — includes retryAfter</td></tr>
          <tr><td><code>404</code></td><td><code>EVENT_NOT_FOUND</code></td><td>No event with this publicKey</td></tr>
          <tr><td><code>400</code></td><td><code>EVENT_NOT_ACTIVE</code></td><td>Event is PENDING or ENDED</td></tr>
        </APITable>

        <SubHeading>Example Request</SubHeading>
        <CodeBlock code={JOIN_CURL} language="bash" />
        <SubHeading>Example Responses</SubHeading>
        <CodeBlock code={JOIN_RES_WON} language="json" />
        <div className="mt-3">
          <CodeBlock code={JOIN_RES_QUEUED} language="json" />
        </div>
      </EndpointBlock>

      {/* GET /api/queue/status */}
      <div className="mt-10">
        <EndpointBlock
          method="GET"
          path="/api/queue/status"
          description="Poll for the current queue position or result. Call this repeatedly until status is WON, SOLD_OUT, or error."
          auth="None (public)"
          rateLimit="3 requests / 2 seconds per IP"
        >
          <SubHeading>Query Parameters</SubHeading>
          <APITable headers={['Param', 'Type', 'Description']}>
            <tr>
              <td><code>pk</code></td>
              <td><code>string</code></td>
              <td>Event public key</td>
            </tr>
            <tr>
              <td><code>userId</code></td>
              <td><code>string</code></td>
              <td>Your user&apos;s unique identifier</td>
            </tr>
          </APITable>

          <SubHeading>Responses</SubHeading>
          <APITable headers={['Status', 'Code', 'Description']}>
            <tr><td><code>200</code></td><td><code>WON</code></td><td>Includes token if not yet expired, or tokenExpired: true</td></tr>
            <tr><td><code>200</code></td><td><code>QUEUED</code></td><td>Includes current position and estimatedWaitMs</td></tr>
            <tr><td><code>200</code></td><td><code>SOLD_OUT</code></td><td>No stock remaining</td></tr>
            <tr><td><code>404</code></td><td><code>NOT_FOUND</code></td><td>No queue entry for this userId and publicKey</td></tr>
          </APITable>

          <SubHeading>Example Request</SubHeading>
          <CodeBlock code={STATUS_CURL} language="bash" />
          <SubHeading>Example Response</SubHeading>
          <CodeBlock code={STATUS_RES} language="json" />
        </EndpointBlock>
      </div>

      {/* GET /api/queue/info */}
      <div className="mt-10">
        <EndpointBlock
          method="GET"
          path="/api/queue/info"
          description="Get queue statistics before the user joins. Use this to show a waiting room preview or estimated wait on your product page."
          auth="None"
        >
          <SubHeading>Query Parameters</SubHeading>
          <APITable headers={['Param', 'Type', 'Description']}>
            <tr>
              <td><code>pk</code></td>
              <td><code>string</code></td>
              <td>Event public key</td>
            </tr>
          </APITable>

          <SubHeading>Response</SubHeading>
          <APITable headers={['Field', 'Type', 'Description']}>
            <tr><td><code>status</code></td><td><code>string</code></td><td>Event status: ACTIVE, PAUSED, ENDED, PENDING</td></tr>
            <tr><td><code>queueLength</code></td><td><code>number</code></td><td>Current number of users in queue</td></tr>
            <tr><td><code>rateLimit</code></td><td><code>number</code></td><td>Max winners released per second</td></tr>
            <tr><td><code>stockRemaining</code></td><td><code>number</code></td><td>Units of stock not yet claimed</td></tr>
            <tr><td><code>estimatedWaitMs</code></td><td><code>number</code></td><td>Estimated wait for a new joiner in milliseconds</td></tr>
          </APITable>

          <SubHeading>Example Request</SubHeading>
          <CodeBlock code={INFO_CURL} language="bash" />
          <SubHeading>Example Response</SubHeading>
          <CodeBlock code={INFO_RES} language="json" />
        </EndpointBlock>
      </div>

      {/* ── Verification Endpoints ── */}
      <SectionH2>Verification Endpoints</SectionH2>

      {/* POST /api/queue/verify */}
      <EndpointBlock
        method="POST"
        path="/api/queue/verify"
        description="Verify a purchase token and mark it as used (double-spend prevention). Call this from your server before processing payment."
        auth="x-public-key header"
      >
        <SubHeading>Request Headers</SubHeading>
        <APITable headers={['Header', 'Description']}>
          <tr>
            <td><code>x-public-key</code></td>
            <td>Your event&apos;s public key</td>
          </tr>
        </APITable>

        <SubHeading>Request Body</SubHeading>
        <APITable headers={['Field', 'Type', 'Description']}>
          <tr>
            <td><code>token</code></td>
            <td><code>string</code></td>
            <td>The JWT token from the queue won event</td>
          </tr>
        </APITable>

        <SubHeading>Responses</SubHeading>
        <APITable headers={['Status', 'Description']}>
          <tr><td><code>200</code></td><td>Token valid — body includes userId, eventId, jti</td></tr>
          <tr><td><code>400</code></td><td>Public key in token does not match x-public-key header</td></tr>
          <tr><td><code>401</code></td><td>Invalid or expired token signature</td></tr>
          <tr><td><code>409</code></td><td>Token already used — double-spend attempt blocked</td></tr>
        </APITable>

        <SubHeading>Example Request</SubHeading>
        <CodeBlock code={VERIFY_CURL} language="bash" />
        <SubHeading>Example Response</SubHeading>
        <CodeBlock code={VERIFY_RES} language="json" />
      </EndpointBlock>

      {/* POST /api/queue/release */}
      <div className="mt-10">
        <EndpointBlock
          method="POST"
          path="/api/queue/release"
          description="Release a ticket back to the pool when payment fails. Restores one unit of stock and passes the spot to the next queued user."
          auth="HMAC-SHA256 signature"
        >
          <SubHeading>Request Headers</SubHeading>
          <APITable headers={['Header', 'Description']}>
            <tr><td><code>x-public-key</code></td><td>Your event&apos;s public key</td></tr>
            <tr><td><code>x-signature</code></td><td>HMAC signature: <code>{'sha256={hexDigest}'}</code></td></tr>
            <tr><td><code>x-timestamp</code></td><td>Current time as milliseconds since epoch</td></tr>
          </APITable>

          <SubHeading>Request Body</SubHeading>
          <APITable headers={['Field', 'Type', 'Description']}>
            <tr>
              <td><code>jti</code></td>
              <td><code>string</code></td>
              <td>Token ID from the original purchase token</td>
            </tr>
            <tr>
              <td><code>reason</code></td>
              <td><code>PAYMENT_FAILED | CANCELLED | EXPIRED</code></td>
              <td>Why the ticket is being returned</td>
            </tr>
          </APITable>

          <SubHeading>Responses</SubHeading>
          <APITable headers={['Status', 'Description']}>
            <tr><td><code>200</code></td><td>Ticket released — stock restored by 1</td></tr>
            <tr><td><code>401</code></td><td>HMAC signature invalid or timestamp too old (±5 min window)</td></tr>
            <tr><td><code>404</code></td><td>jti not found</td></tr>
            <tr><td><code>409</code></td><td>Ticket already released</td></tr>
          </APITable>

          <SubHeading>Example Request (bash + openssl)</SubHeading>
          <CodeBlock code={RELEASE_CURL} language="bash" />
          <SubHeading>Example Response</SubHeading>
          <CodeBlock code={RELEASE_RES} language="json" />
        </EndpointBlock>
      </div>

      {/* ── JWKS Endpoint ── */}
      <SectionH2>JWKS Endpoint</SectionH2>

      <EndpointBlock
        method="GET"
        path="/api/.well-known/jwks/:eventPublicKey"
        description="Retrieve the RSA public key for a given event in JWK Set format. Use this to verify purchase tokens offline without an API call."
        auth="None"
      >
        <SubHeading>Response</SubHeading>
        <Prose>
          <p>
            Returns a standard{' '}
            <a href="https://datatracker.ietf.org/doc/html/rfc7517" target="_blank" rel="noopener">
              JWK Set (RFC 7517)
            </a>{' '}
            object. Cache this response — the key rotates infrequently.
          </p>
        </Prose>
        <SubHeading>Example Request</SubHeading>
        <CodeBlock code={JWKS_CURL} language="bash" />
        <SubHeading>Example Response</SubHeading>
        <CodeBlock code={JWKS_RES} language="json" />
      </EndpointBlock>

      {/* ── JWT Token Format ── */}
      <SectionH2>Purchase Token Format (JWT)</SectionH2>
      <Prose>
        <p>
          Tokens issued by the queue engine are signed JWTs (RS256). The
          payload contains:
        </p>
      </Prose>
      <CodeBlock code={JWT_PAYLOAD} language="json" />
      <div className="mt-4 overflow-x-auto rounded-lg border border-border-subtle">
        <Prose>
          <table>
            <thead>
              <tr>
                <th>Claim</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><code>jti</code></td>
                <td>Unique token ID used as the idempotency key for <code>verifyToken</code> and <code>releaseTicket</code></td>
              </tr>
              <tr>
                <td><code>sub</code></td>
                <td>The <code>userId</code> you provided when joining the queue</td>
              </tr>
              <tr>
                <td><code>pk</code></td>
                <td>The event&apos;s public key — verified against <code>x-public-key</code> in the verify endpoint</td>
              </tr>
              <tr>
                <td><code>eid</code></td>
                <td>Internal event ID</td>
              </tr>
              <tr>
                <td><code>exp</code></td>
                <td>Unix expiry timestamp in seconds. Tokens expire after 10 minutes by default.</td>
              </tr>
            </tbody>
          </table>
        </Prose>
      </div>
    </div>
  );
}
