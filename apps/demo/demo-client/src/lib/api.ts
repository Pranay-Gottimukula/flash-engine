import { FlashQueue } from "@flashengine/browser";
import { addEntry } from "./debug";
import type { QueueInfo, CheckoutResult, ReleaseResult } from "./types";

// ── Persistence keys ──────────────────────────────────────────────────────────

const QUEUE_STATE_KEY = "flash_queue_state";

export interface PersistedQueueState {
  pk: string;
  status: "queued" | "won_checkout";
  token?: string;
  position?: number;
}

export function saveQueueState(s: PersistedQueueState) {
  localStorage.setItem(QUEUE_STATE_KEY, JSON.stringify(s));
}

export function loadQueueState(): PersistedQueueState | null {
  try {
    const raw = localStorage.getItem(QUEUE_STATE_KEY);
    return raw ? (JSON.parse(raw) as PersistedQueueState) : null;
  } catch {
    return null;
  }
}

export function clearQueueState() {
  localStorage.removeItem(QUEUE_STATE_KEY);
}

// ── Logging ───────────────────────────────────────────────────────────────────

function log(method: string, url: string, status: number, ms: number, label?: string) {
  const shortUrl = url.replace(/^https?:\/\/[^/]+/, "");
  const category =
    status === 0       ? "error"
    : status >= 200 && status < 300 ? "success"
    : status === 202   ? "queue"
    : status >= 400    ? "error"
    : "info";
  addEntry({ method, url: shortUrl, status, ms, label, category });
}

// ── SDK-backed queue operations ───────────────────────────────────────────────

/**
 * Fetch live queue info (stock, wait time, etc.)
 * Uses FlashQueue.getInfo() under the hood.
 */
export async function fetchQueueInfo(engineUrl: string, pk: string): Promise<QueueInfo> {
  // We use a temporary FlashQueue instance just to call getInfo.
  // FlashQueue's Transport.info() maps to GET /api/queue/info?pk=<pk>
  const url = `${engineUrl}/api/queue/info?pk=${encodeURIComponent(pk)}`;
  const t0 = performance.now();
  const res = await fetch(url);
  const ms = Math.round(performance.now() - t0);
  let data: QueueInfo = { stock: 0, queueLength: 0, rateLimit: 1, estimatedWaitMs: 0 };
  try { data = await res.json(); } catch { /* empty */ }
  log("GET", url, res.status, ms, data.status ?? "queue info");
  return data;
}

/**
 * Join the queue using the FlashQueue SDK.
 * Returns a promise that resolves immediately once the join response is received.
 * Polling is handled internally by the SDK — this just fires the join call.
 */
export function createFlashQueue(
  engineUrl: string,
  pk: string,
  userId: string,
): FlashQueue {
  return new FlashQueue({
    apiUrl:   engineUrl,
    publicKey: pk,
    userId,
  });
}

/**
 * One-shot join: resolves with the initial join result (WON / QUEUED / SOLD_OUT).
 * The caller is responsible for attaching further event listeners for polling.
 */
export async function joinQueue(
  engineUrl: string,
  pk: string,
  userId: string,
): Promise<{ result: { status: "WON" | "QUEUED" | "SOLD_OUT"; token?: string; position?: number; estimatedWaitMs?: number }; status: number }> {
  // We fire a raw join request and interpret the first SDK event so we can
  // keep the same call-site API as before (returning { result, status }).
  return new Promise((resolve) => {
    const queue = new FlashQueue({ apiUrl: engineUrl, publicKey: pk, userId });
    const t0 = performance.now();

    const cleanup = () => queue.destroy();

    queue.on("won", ({ token }) => {
      cleanup();
      const ms = Math.round(performance.now() - t0);
      log("POST", `${engineUrl}/api/queue/join`, 200, ms, "WON");
      resolve({ result: { status: "WON", token }, status: 200 });
    });

    queue.on("queued", ({ position, estimatedWaitMs }) => {
      // Don't destroy — caller will want to resume polling.
      // But we resolve so App.tsx can transition to the queue page.
      const ms = Math.round(performance.now() - t0);
      log("POST", `${engineUrl}/api/queue/join`, 202, ms, "QUEUED");
      resolve({ result: { status: "QUEUED", position, estimatedWaitMs }, status: 202 });
    });

    queue.on("sold_out", () => {
      cleanup();
      const ms = Math.round(performance.now() - t0);
      log("POST", `${engineUrl}/api/queue/join`, 200, ms, "SOLD_OUT");
      resolve({ result: { status: "SOLD_OUT" }, status: 200 });
    });

    queue.on("error", () => {
      cleanup();
      const ms = Math.round(performance.now() - t0);
      log("POST", `${engineUrl}/api/queue/join`, 0, ms, "error");
      // Treat errors as sold-out so the UI has somewhere to go
      resolve({ result: { status: "SOLD_OUT" }, status: 0 });
    });

    queue.join();
  });
}

/**
 * Poll for queue status using the FlashQueue SDK.
 * We instantiate a fresh queue in polling-only mode by calling join() which
 * internally handles ALREADY_JOINED → starts polling.
 * Resolves on the next status event.
 */
export async function pollStatus(
  engineUrl: string,
  pk: string,
  userId: string,
): Promise<{ result: { status: "WON" | "QUEUED" | "SOLD_OUT" | "NOT_FOUND"; token?: string; position?: number }; status: number }> {
  // Directly hit the status endpoint to stay lightweight for per-2s polling.
  const url = `${engineUrl}/api/queue/status?pk=${encodeURIComponent(pk)}&userId=${encodeURIComponent(userId)}`;
  const t0 = performance.now();
  const res = await fetch(url, { headers: { "x-demo-bypass": "true" } });
  const ms = Math.round(performance.now() - t0);
  let result: { status: "WON" | "QUEUED" | "SOLD_OUT" | "NOT_FOUND"; token?: string; position?: number } = { status: "NOT_FOUND" };
  try { result = await res.json(); } catch { /* empty */ }
  log("GET", url, res.status, ms, result.status);
  return { result, status: res.status };
}

// ── Demo-server calls (unchanged — these go to the merchant backend) ──────────

export async function checkout(
  serverUrl: string,
  token: string,
  userId: string,
): Promise<{ result: CheckoutResult; status: number }> {
  const url = `${serverUrl}/api/checkout`;
  const t0 = performance.now();
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, userId }),
    });
  } catch {
    const ms = Math.round(performance.now() - t0);
    log("POST", url, 0, ms, "OFFLINE");
    return { result: { success: false, error: "SERVER_OFFLINE" }, status: 0 };
  }
  const ms = Math.round(performance.now() - t0);
  let result: CheckoutResult = { success: false };
  try { result = await res.json(); } catch { /* empty */ }
  const label = res.status === 200 ? "verified" : res.status === 409 ? "ALREADY_USED" : "error";
  log("POST", url, res.status, ms, label);
  return { result, status: res.status };
}

export async function releasePurchase(
  serverUrl: string,
  jti: string,
  reason: "PAYMENT_FAILED" | "CANCELLED",
): Promise<{ result: ReleaseResult; status: number }> {
  const url = `${serverUrl}/api/checkout/fail`;
  const t0 = performance.now();
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jti, reason }),
    });
  } catch {
    const ms = Math.round(performance.now() - t0);
    log("POST", url, 0, ms, "OFFLINE");
    return { result: { error: "SERVER_OFFLINE" }, status: 0 };
  }
  const ms = Math.round(performance.now() - t0);
  let result: ReleaseResult = {};
  try { result = await res.json(); } catch { /* empty */ }
  const label = res.status === 200 ? "released" : res.status === 409 ? "ALREADY_RELEASED" : "error";
  log("POST", url, res.status, ms, label);
  return { result, status: res.status };
}

export function getUserId(): string {
  const key = "flash_user_id";
  let id = localStorage.getItem(key);
  if (!id) {
    id = "user_" + Array.from(crypto.getRandomValues(new Uint8Array(4)))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    localStorage.setItem(key, id);
  }
  return id;
}

export function decodeToken(token: string) {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return { jti: payload.jti as string, exp: payload.exp as number };
  } catch {
    return { jti: "unknown", exp: 0 };
  }
}

// Re-export FlashQueue so components can use it directly if needed
export { FlashQueue };
