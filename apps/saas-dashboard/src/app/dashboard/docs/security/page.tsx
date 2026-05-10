import { PageHeader } from '@/components/layout/page-header';
import { Prose }       from '@/components/docs/prose';
import { Callout }     from '@/components/docs/callout';

function SectionH2({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-4 mt-10 border-b border-border-subtle pb-2 text-xl font-semibold text-text-primary">
      {children}
    </h2>
  );
}

function DiagramBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-4 rounded-lg border border-border-subtle bg-surface-raised px-6 py-5 font-mono text-xs text-text-secondary">
      {children}
    </div>
  );
}

export default function SecurityPage() {
  return (
    <div className="animate-page-in">
      <PageHeader
        title="Security Model"
        description="How FlashEngine protects your sale from fraud and abuse"
      />

      {/* Token Security */}
      <SectionH2>Token Security (RS256)</SectionH2>
      <Prose>
        <p>
          Purchase tokens are signed with RSA-SHA256 (RS256), not symmetric
          HMAC. This is a deliberate security choice:
        </p>
        <ul>
          <li>
            Each event gets its own <strong>2048-bit RSA keypair</strong>,
            generated fresh at event creation
          </li>
          <li>
            Your server verifies tokens using only the{' '}
            <strong>public key</strong> — it never needs the private key
          </li>
          <li>
            Even if your server is fully compromised, an attacker cannot
            forge new purchase tokens — forging requires the private key
          </li>
          <li>
            The <strong>private key never leaves the FlashEngine engine</strong>.
            It is generated in memory and used only to sign the winning token.
          </li>
        </ul>
        <p>
          RS256 means verification is asymmetric: the signing key and the
          verification key are different. Your backend can verify tokens
          without any shared secret.
        </p>
      </Prose>

      {/* Double-Spend */}
      <SectionH2>Double-Spend Prevention</SectionH2>
      <Prose>
        <p>
          Every token has a unique JTI (JWT ID). The double-spend guarantee
          is enforced at the database layer:
        </p>
        <ul>
          <li>
            When you call <code>verifyToken()</code>, the JTI is inserted
            into a database table with a <strong>PRIMARY KEY constraint</strong>
          </li>
          <li>
            Two simultaneous verify calls race to INSERT — the loser gets a
            constraint violation, returned to you as{' '}
            <code>409 TOKEN_USED</code>
          </li>
          <li>
            No distributed locks needed — the database constraint{' '}
            <strong>is</strong> the lock
          </li>
        </ul>
      </Prose>

      <DiagramBox>
        <div className="mb-3 text-text-tertiary">// Two simultaneous verify() calls for the same token</div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="mb-1 text-accent">Request A</div>
            <div>verifyToken(token)</div>
            <div className="mt-1 text-text-tertiary">→ INSERT jti ... OK</div>
            <div className="text-accent">→ 200 valid: true ✓</div>
          </div>
          <div>
            <div className="mb-1 text-text-tertiary">Request B</div>
            <div>verifyToken(token)</div>
            <div className="mt-1 text-text-tertiary">→ INSERT jti ... CONFLICT</div>
            <div className="text-red-400">→ 409 TOKEN_USED ✗</div>
          </div>
        </div>
      </DiagramBox>

      {/* HMAC Release Auth */}
      <SectionH2>HMAC Release Authentication</SectionH2>
      <Prose>
        <p>
          The release endpoint uses HMAC-SHA256 to authenticate that the
          request came from your server:
        </p>
        <ul>
          <li>
            Your <code>signingSecret</code> is used to sign a message
            constructed from the current timestamp and the JSON request body
          </li>
          <li>
            The engine recomputes the HMAC and compares using a{' '}
            <strong>constant-time comparison</strong> — safe against timing
            attacks
          </li>
          <li>
            Timestamps older than <strong>5 minutes</strong> are rejected,
            preventing replay attacks
          </li>
          <li>
            The SDK handles all HMAC construction automatically — you never
            compute it manually
          </li>
        </ul>
      </Prose>

      {/* Per-Event Isolation */}
      <SectionH2>Per-Event Key Isolation</SectionH2>
      <Prose>
        <p>
          Each flash sale event is fully isolated at the key level:
        </p>
        <ul>
          <li>
            Every event has its own RSA keypair and its own signing secret
          </li>
          <li>
            Compromise of one event&apos;s credentials does not affect any
            other event — there is no shared root key
          </li>
          <li>
            Keys are generated fresh for every event, including events
            created by duplicating an existing one
          </li>
        </ul>
      </Prose>

      {/* Key Placement */}
      <SectionH2>What Goes Where</SectionH2>
      <Prose>
        <p>
          Use this as a quick reference for where each credential belongs:
        </p>
      </Prose>
      <div className="overflow-x-auto rounded-lg border border-border-subtle">
        <Prose>
          <table>
            <thead>
              <tr>
                <th>Key</th>
                <th>Where it goes</th>
                <th>Where it NEVER goes</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><code>Public Key</code></td>
                <td>Frontend code, SDK config, environment variables</td>
                <td>—</td>
              </tr>
              <tr>
                <td><code>Signing Secret</code></td>
                <td>Backend environment variables only</td>
                <td>Frontend code, client-side JS, git repositories</td>
              </tr>
              <tr>
                <td><code>RSA Public Key</code></td>
                <td>Backend (for offline token verification)</td>
                <td>—</td>
              </tr>
              <tr>
                <td><code>RSA Private Key</code></td>
                <td>FlashEngine engine only</td>
                <td>Your code — you never receive this key</td>
              </tr>
            </tbody>
          </table>
        </Prose>
      </div>
      <Callout type="danger" className="mt-4">
        Never put your Signing Secret in frontend code. It authenticates
        release requests — if exposed, anyone can release tickets from your
        sale and return stock to the pool.
      </Callout>

      {/* Rate Limiting */}
      <SectionH2>Rate Limiting</SectionH2>
      <Prose>
        <p>
          All public endpoints are rate-limited per IP address:
        </p>
      </Prose>
      <div className="overflow-x-auto rounded-lg border border-border-subtle">
        <Prose>
          <table>
            <thead>
              <tr>
                <th>Endpoint</th>
                <th>Limit</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><code>POST /api/queue/join</code></td>
                <td>5 requests / 10 seconds per IP</td>
              </tr>
              <tr>
                <td><code>GET /api/queue/status</code></td>
                <td>3 requests / 2 seconds per IP</td>
              </tr>
              <tr>
                <td>Auth endpoints (verify, release)</td>
                <td>10 requests / 15 minutes per IP</td>
              </tr>
            </tbody>
          </table>
        </Prose>
      </div>
      <Prose>
        <p>
          Rate limiters use in-memory storage, not Redis. This means they
          continue to enforce limits even during Redis outages, and do not
          add latency to queue lookups.
        </p>
      </Prose>
    </div>
  );
}
