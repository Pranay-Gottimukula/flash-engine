// ulimit -n 65535

// curl -fsSL https://bun.sh/install | bash
// source ~/.bashrc
// pm2 start src/server.ts -i max

/**
 * k6 Load Test — Flash Sale Engine
 * ─────────────────────────────────────────────────────────────────────────────
 * Hits the Engine Gateway (port 4000) directly for ALL routes: 
 * join, status, AND verify (checkout). Bypasses the demo storefront completely.
 *
 * Usage:
 * k6 run -e API_URL=http://localhost:4000 -e PUBLIC_KEY=your_key apps/engine-gateway/scripts/load-test.js
 * ─────────────────────────────────────────────────────────────────────────────
 */

import http    from 'k6/http';
import { sleep, check } from 'k6';
import { Trend, Counter } from 'k6/metrics';

// ── Custom metrics ─────────────────────────────────────────────────────────
const successfulJoins    = new Counter('successful_joins');
const totalWins          = new Counter('total_wins');
const soldOuts           = new Counter('sold_outs');
const checkoutSuccesses  = new Counter('checkout_successes');

const joinDuration       = new Trend('join_duration_ms',     true);
const pollDuration       = new Trend('poll_duration_ms',     true);
const checkoutDuration   = new Trend('checkout_duration_ms', true);

// ── Load-test stages ───────────────────────────────────────────────────────
export const options = {
  stages: [
    { duration: '30s', target: 2000 }, 
    { duration: '60s', target: 2000 }, 
    { duration: '15s', target: 0    }, 
  ],
  thresholds: {
    http_req_failed:      ['rate<0.05'],
    join_duration_ms:     ['p(95)<5000'],
    poll_duration_ms:     ['p(95)<3000'],
    checkout_duration_ms: ['p(95)<5000'],
  },
};

// ── Config ─────────────────────────────────────────────────────────────────
const API_URL      = __ENV.API_URL      || 'http://localhost:3000';
const PUBLIC_KEY   = __ENV.PUBLIC_KEY   || '';
const POLL_INTERVAL = parseInt(__ENV.POLL_INTERVAL || '2', 10);

if (!PUBLIC_KEY) {
  throw new Error('PUBLIC_KEY env var is required. Pass it with -e PUBLIC_KEY=<your_key>');
}

const BYPASS_HEADERS = {
  'Content-Type':  'application/json',
  'x-demo-bypass': 'true',
};

// ── Helpers ────────────────────────────────────────────────────────────────
function makeUserId() { return `k6_vu${__VU}_iter${__ITER}`; }
function safeJson(res) { try { return res.json(); } catch (_) { return null; } }
function getResult(data) { return data ? (data.result || data.status || null) : null; }

// ── Main VU journey ────────────────────────────────────────────────────────
export default function () {
  const userId = makeUserId();

  // 1. JOIN
  const joinRes = http.post(
    `${API_URL}/api/queue/join`,
    JSON.stringify({ publicKey: PUBLIC_KEY, userId }),
    { headers: BYPASS_HEADERS, tags: { name: 'join' } },
  );

  joinDuration.add(joinRes.timings.duration);

  if (!check(joinRes, { 'join: status 2xx': (r) => r.status >= 200 && r.status < 300 })) {
    sleep(1); return;
  }

  const joinData = safeJson(joinRes);
  const joinResult = getResult(joinData);
  if (!joinResult) return;

  successfulJoins.add(1);

  // 2. EVALUATE
  if (joinResult === 'SOLD_OUT') { soldOuts.add(1); return; }
  if (joinResult === 'WON') {
    totalWins.add(1);
    doVerify(joinData.token);
    return;
  }

  if (joinResult !== 'QUEUED' && joinResult !== 'ALREADY_JOINED') return;

  // 3. POLL LOOP
  let wonToken = null;
  const MAX_POLLS = 300;

  for (let i = 0; i < MAX_POLLS; i++) {
    sleep(POLL_INTERVAL);

    const pollRes = http.get(
      `${API_URL}/api/queue/status?pk=${encodeURIComponent(PUBLIC_KEY)}&userId=${encodeURIComponent(userId)}`,
      { headers: BYPASS_HEADERS, tags: { name: 'poll' } },
    );

    pollDuration.add(pollRes.timings.duration);

    if (!check(pollRes, { 'poll: status 2xx': (r) => r.status >= 200 && r.status < 300 })) continue;

    const pollData = safeJson(pollRes);
    const pollResult = getResult(pollData);

    if (pollResult === 'SOLD_OUT') { soldOuts.add(1); break; }
    if (pollResult === 'WON') {
      totalWins.add(1);
      wonToken = pollData ? pollData.token : null;
      break;
    }
  }

  // 4. VERIFY (CHECKOUT)
  if (wonToken) doVerify(wonToken);
}

// ── Verify helper (Direct to Engine) ───────────────────────────────────────
function doVerify(token) {
  if (!token) return;

  // Hitting the engine directly! No demo storefront needed.
  const verifyRes = http.post(
    `${API_URL}/api/queue/verify`,
    JSON.stringify({ token }),
    {
      headers: {
        'Content-Type': 'application/json',
        'x-public-key': PUBLIC_KEY // Required by your verify route
      },
      tags: { name: 'verify' },
    },
  );

  checkoutDuration.add(verifyRes.timings.duration);

  if (check(verifyRes, { 'verify: status 2xx': (r) => r.status >= 200 && r.status < 300 })) {
    checkoutSuccesses.add(1);
  }
}