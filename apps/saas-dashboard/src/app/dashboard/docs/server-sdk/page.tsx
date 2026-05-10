import { PageHeader } from '@/components/layout/page-header';
import { Prose }       from '@/components/docs/prose';
import { CodeBlock }   from '@/components/docs/code-block';
import { Callout }     from '@/components/docs/callout';
import { Step }        from '@/components/docs/step';

/* ── Code constants ──────────────────────────────────────────────────────── */

const INSTALL_CODE = `npm install @flashengine/server`;

const CONSTRUCTOR_CODE = `\
import { FlashEngine } from '@flashengine/server';

const engine = new FlashEngine({
  publicKey:        'pub_live_abc123',
  signingSecret:    process.env.FLASH_SIGNING_SECRET!,
  // Optional:
  apiUrl:           'https://api.flashengine.dev',
  rsaPublicKey:     process.env.FLASH_RSA_PUBLIC_KEY,
  jwksCache:        true,
  requestTimeoutMs: 10000,
});`;

const VERIFY_TOKEN_CODE = `\
app.post('/api/checkout', async (req, res) => {
  const { token } = req.body;

  try {
    const result = await engine.verifyToken(token);
    // result = { valid: true, userId, eventId, jti }

    // Token is valid and marked used — safe to charge
    await processPayment(result.userId, req.body.paymentMethod);
    res.json({ success: true });
  } catch (err) {
    if (err.code === 'TOKEN_USED') {
      return res.status(409).json({ error: 'Token already used' });
    }
    if (err.code === 'INVALID_TOKEN') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});`;

const RELEASE_TICKET_CODE = `\
app.post('/api/checkout', async (req, res) => {
  const { token } = req.body;
  let verified;

  try {
    verified = await engine.verifyToken(token);
  } catch (err) {
    if (err.code === 'TOKEN_USED') {
      return res.status(409).json({ error: 'Token already used' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }

  try {
    await processPayment(verified.userId, req.body.paymentMethod);
    res.json({ success: true });
  } catch (paymentErr) {
    // Return the ticket so the next queued user receives it
    await engine.releaseTicket(verified.jti, 'PAYMENT_FAILED');
    // { released: true, stockRestored: 1 }
    res.status(402).json({ error: 'Payment failed' });
  }
});`;

const VERIFY_OFFLINE_CODE = `\
// Lightweight JWT check — no API call, no double-spend protection
const payload = await engine.verifyTokenOffline(token);
// { userId, publicKey, eventId, jti, expiresAt }

// Good for: rendering checkout UI before the heavy verifyToken() call
if (Date.now() / 1000 > payload.expiresAt) {
  return res.status(401).json({ error: 'Token expired' });
}

// SDK fetches JWKS and caches it automatically.
// Or supply rsaPublicKey in the constructor to skip the network call:
//   const engine = new FlashEngine({ publicKey, signingSecret, rsaPublicKey: pemString });`;

const ERROR_CODE = `\
import { FlashEngineError } from '@flashengine/server';

try {
  const result = await engine.verifyToken(token);
  // ...
} catch (err) {
  if (!(err instanceof FlashEngineError)) throw err;

  switch (err.code) {
    case 'TOKEN_USED':
      return res.status(409).json({ error: 'Token already used' });
    case 'INVALID_TOKEN':
      return res.status(401).json({ error: 'Invalid token' });
    case 'PK_MISMATCH':
      return res.status(400).json({ error: 'Token issued for wrong event' });
    default:
      // err.statusCode and err.message are also available
      return res.status(err.statusCode ?? 500).json({ error: err.message });
  }
}`;

const PYTHON_CODE = `\
import hmac
import hashlib
import json
import time
import requests

SIGNING_SECRET = "your_signing_secret"
PUBLIC_KEY     = "pub_live_abc123"
API_URL        = "https://api.flashengine.dev"

def release_ticket(jti: str, reason: str) -> dict:
    body      = json.dumps({"jti": jti, "reason": reason}, separators=(",", ":"))
    timestamp = str(int(time.time() * 1000))
    message   = timestamp + "." + body

    signature = hmac.new(
        SIGNING_SECRET.encode(),
        message.encode(),
        hashlib.sha256,
    ).hexdigest()

    response = requests.post(
        f"{API_URL}/v1/tickets/{jti}/release",
        data=body,
        headers={
            "Content-Type": "application/json",
            "x-public-key": PUBLIC_KEY,
            "x-timestamp":  timestamp,
            "x-signature":  "sha256=" + signature,
        },
    )
    response.raise_for_status()
    return response.json()

# Usage
result = release_ticket("jti_abc123", "PAYMENT_FAILED")
print(result)  # {'released': True, 'stockRestored': 1}`;

const GO_CODE = `\
package main

import (
    "crypto/hmac"
    "crypto/sha256"
    "encoding/hex"
    "encoding/json"
    "fmt"
    "net/http"
    "strconv"
    "strings"
    "time"
)

const (
    signingSecret = "your_signing_secret"
    publicKey     = "pub_live_abc123"
    apiURL        = "https://api.flashengine.dev"
)

func releaseTicket(jti, reason string) error {
    body, _   := json.Marshal(map[string]string{"jti": jti, "reason": reason})
    timestamp  := strconv.FormatInt(time.Now().UnixMilli(), 10)
    message   := timestamp + "." + string(body)

    mac := hmac.New(sha256.New, []byte(signingSecret))
    mac.Write([]byte(message))
    sig := "sha256=" + hex.EncodeToString(mac.Sum(nil))

    req, _ := http.NewRequest("POST",
        apiURL+"/v1/tickets/"+jti+"/release",
        strings.NewReader(string(body)),
    )
    req.Header.Set("Content-Type", "application/json")
    req.Header.Set("x-public-key", publicKey)
    req.Header.Set("x-timestamp",  timestamp)
    req.Header.Set("x-signature",  sig)

    resp, err := (&http.Client{}).Do(req)
    if err != nil {
        return err
    }
    defer resp.Body.Close()
    fmt.Println("Status:", resp.Status)
    return nil
}

func main() {
    if err := releaseTicket("jti_abc123", "PAYMENT_FAILED"); err != nil {
        panic(err)
    }
}`;

const PHP_CODE = `\
<?php

const SIGNING_SECRET = 'your_signing_secret';
const PUBLIC_KEY     = 'pub_live_abc123';
const API_URL        = 'https://api.flashengine.dev';

function releaseTicket(string $jti, string $reason): array {
    $body      = json_encode(['jti' => $jti, 'reason' => $reason]);
    $timestamp = (string) round(microtime(true) * 1000);
    $message   = $timestamp . '.' . $body;
    $signature = 'sha256=' . hash_hmac('sha256', $message, SIGNING_SECRET);

    $ch = curl_init(API_URL . '/v1/tickets/' . $jti . '/release');
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => $body,
        CURLOPT_HTTPHEADER     => [
            'Content-Type: application/json',
            'x-public-key: ' . PUBLIC_KEY,
            'x-timestamp: '  . $timestamp,
            'x-signature: '  . $signature,
        ],
    ]);

    $result = curl_exec($ch);
    curl_close($ch);
    return json_decode($result, true);
}

// Usage
$result = releaseTicket('jti_abc123', 'PAYMENT_FAILED');
var_dump($result); // ['released' => true, 'stockRestored' => 1]`;

/* ── Helpers ─────────────────────────────────────────────────────────────── */

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

/* Inline code styled to match .docs-prose code */
function IC({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-surface px-1.5 py-0.5 font-mono text-xs text-accent">
      {children}
    </code>
  );
}

/* ── Page ────────────────────────────────────────────────────────────────── */

export default function ServerSdkPage() {
  return (
    <div className="animate-page-in">
      <PageHeader
        title="Server SDK Reference"
        description="@flashengine/server — Backend token verification and ticket management"
      />

      {/* Installation */}
      <SectionH2>Installation</SectionH2>
      <CodeBlock code={INSTALL_CODE} language="bash" />
      <Callout type="warning" className="mt-4">
        This package runs on your server only. Never bundle it for the
        browser — it contains your signing secret.
      </Callout>

      {/* Initialization */}
      <SectionH2>Initialization</SectionH2>
      <Prose>
        <p>
          Create one <code>FlashEngine</code> instance per server process and
          reuse it across requests.
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
                <td>Event public key (from dashboard)</td>
              </tr>
              <tr>
                <td><code>signingSecret</code></td>
                <td><code>string</code></td>
                <td>required</td>
                <td>HMAC signing secret (from dashboard)</td>
              </tr>
              <tr>
                <td><code>apiUrl</code></td>
                <td><code>string</code></td>
                <td><code>https://api.flashengine.dev</code></td>
                <td>FlashEngine API base URL</td>
              </tr>
              <tr>
                <td><code>rsaPublicKey</code></td>
                <td><code>string</code></td>
                <td><code>undefined</code></td>
                <td>
                  RSA public key PEM for offline verification. If omitted,
                  the SDK fetches it from the JWKS endpoint automatically.
                </td>
              </tr>
              <tr>
                <td><code>jwksCache</code></td>
                <td><code>boolean</code></td>
                <td><code>true</code></td>
                <td>Cache JWKS responses to avoid repeated network calls</td>
              </tr>
              <tr>
                <td><code>requestTimeoutMs</code></td>
                <td><code>number</code></td>
                <td><code>10000</code></td>
                <td>Timeout for API requests in milliseconds</td>
              </tr>
            </tbody>
          </table>
        </Prose>
      </div>

      {/* verifyToken */}
      <SectionH2>verifyToken(token)</SectionH2>
      <Prose>
        <p>
          Verifies a purchase token <strong>and</strong> atomically marks it
          as used, preventing double-spend. Call this at your checkout
          endpoint before charging the customer.
        </p>
        <p>
          Returns <code>{'{ valid: true, userId, eventId, jti }'}</code>.
          Throws <code>FlashEngineError</code> with codes{' '}
          <code>TOKEN_USED</code> (409), <code>INVALID_TOKEN</code> (401),
          or <code>PK_MISMATCH</code> (400).
        </p>
      </Prose>
      <CodeBlock code={VERIFY_TOKEN_CODE} language="ts" />
      <Callout type="danger" className="mt-4">
        Always call <IC>verifyToken()</IC> before charging the customer. This
        is the double-spend check. Without it, two browser tabs could use the
        same token.
      </Callout>

      {/* releaseTicket */}
      <SectionH2>releaseTicket(jti, reason)</SectionH2>
      <Prose>
        <p>
          Returns a ticket to the pool when payment fails, restoring one unit
          of stock and passing the spot to the next person in the queue. The
          SDK constructs and signs the HMAC request automatically.
        </p>
        <p>
          Valid reasons: <code>PAYMENT_FAILED</code> |{' '}
          <code>CANCELLED</code> | <code>EXPIRED</code>
        </p>
        <p>
          Returns <code>{'{ released: true, stockRestored: 1 }'}</code>.
        </p>
      </Prose>
      <CodeBlock code={RELEASE_TICKET_CODE} language="ts" />
      <Callout type="info" className="mt-4">
        After a ticket is released, the next person in the queue automatically
        receives it. You don&apos;t need to manage this — the engine handles
        the handoff.
      </Callout>

      {/* verifyTokenOffline */}
      <SectionH2>verifyTokenOffline(token)</SectionH2>
      <Prose>
        <p>
          Validates the JWT signature without making an API call. This is
          lightweight and fast, but it{' '}
          <strong>does not prevent double-spend</strong>. Use it to
          pre-validate before rendering the checkout page, then call{' '}
          <code>verifyToken()</code> before the actual charge.
        </p>
        <p>
          Returns{' '}
          <code>{'{ userId, publicKey, eventId, jti, expiresAt }'}</code>.
        </p>
      </Prose>
      <CodeBlock code={VERIFY_OFFLINE_CODE} language="ts" />

      {/* Error Handling */}
      <SectionH2>Error Handling</SectionH2>
      <Prose>
        <p>
          All methods throw <code>FlashEngineError</code> on failure.
          The error has <code>code</code>, <code>message</code>, and{' '}
          <code>statusCode</code> properties for precise handling.
        </p>
      </Prose>
      <CodeBlock code={ERROR_CODE} language="ts" />

      {/* Non-Node.js Clients */}
      <SectionH2>Non-Node.js Clients</SectionH2>
      <Prose>
        <p>
          If you&apos;re using Python, Go, PHP, or another language, you can
          call the FlashEngine REST API directly. The only non-standard step
          is constructing the HMAC signature for authenticated endpoints like{' '}
          <code>releaseTicket</code>.
        </p>
      </Prose>

      <SectionH3>HMAC Signature Construction</SectionH3>
      <Prose>
        <p>
          Follow these steps to sign any request that requires authentication:
        </p>
      </Prose>
      <div className="mt-4">
        <Step number={1} title="Serialize the request body">
          JSON-encode the body with no extra whitespace.{' '}
          <IC>{'{ "jti": "...", "reason": "..." }'}</IC>
        </Step>
        <Step number={2} title="Get the current timestamp">
          Milliseconds since epoch as a string.{' '}
          <IC>Date.now().toString()</IC>
        </Step>
        <Step number={3} title="Construct the signing message">
          Concatenate timestamp and body with a period separator.{' '}
          <IC>{'`${timestamp}.${bodyString}`'}</IC>
        </Step>
        <Step number={4} title="Compute HMAC-SHA256">
          Use your <IC>signingSecret</IC> as the key. Hex-encode the
          digest.
        </Step>
        <Step number={5} title="Set the request headers">
          <div className="mt-1 space-y-1">
            <div><IC>x-signature</IC>{': '}<IC>{'sha256={hexDigest}'}</IC></div>
            <div><IC>x-timestamp</IC>{': '}<IC>{'{timestamp}'}</IC></div>
            <div><IC>x-public-key</IC>{': '}<IC>{'{publicKey}'}</IC></div>
          </div>
        </Step>
      </div>

      <SectionH3>Python</SectionH3>
      <CodeBlock code={PYTHON_CODE} language="python" />

      <SectionH3>Go</SectionH3>
      <CodeBlock code={GO_CODE} language="go" />

      <SectionH3>PHP</SectionH3>
      <CodeBlock code={PHP_CODE} language="php" />
    </div>
  );
}
