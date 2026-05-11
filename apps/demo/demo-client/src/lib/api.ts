import { addEntry } from "./debug";
import type { QueueInfo, JoinResult, StatusResult, CheckoutResult, ReleaseResult } from "./types";

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

// ── API calls ─────────────────────────────────────────────────────────────────

export async function fetchQueueInfo(engineUrl: string, pk: string): Promise<QueueInfo> {
  const url = `${engineUrl}/api/queue/info?pk=${encodeURIComponent(pk)}`;
  const t0 = performance.now();
  const res = await fetch(url);
  const ms = Math.round(performance.now() - t0);
  let data: QueueInfo = { stock: 0, queueLength: 0, rateLimit: 1, estimatedWaitMs: 0 };
  try { data = await res.json(); } catch { /* empty */ }
  log("GET", url, res.status, ms, data.status ?? "queue info");
  return data;
}

export async function joinQueue(
  engineUrl: string,
  pk: string,
  userId: string
): Promise<{ result: JoinResult; status: number }> {
  const url = `${engineUrl}/api/queue/join`;
  const t0 = performance.now();
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-demo-bypass": "true" },
    body: JSON.stringify({ publicKey: pk, userId }),
  });
  const ms = Math.round(performance.now() - t0);
  let result: JoinResult = { status: "SOLD_OUT" };
  try { result = await res.json(); } catch { /* empty */ }
  const label = res.status === 200 ? "WON" : res.status === 202 ? "QUEUED" : "SOLD_OUT";
  log("POST", url, res.status, ms, label);
  return { result, status: res.status };
}

export async function pollStatus(
  engineUrl: string,
  pk: string,
  userId: string
): Promise<{ result: StatusResult; status: number }> {
  const url = `${engineUrl}/api/queue/status?pk=${encodeURIComponent(pk)}&userId=${encodeURIComponent(userId)}`;
  const t0 = performance.now();
  const res = await fetch(url, { headers: { "x-demo-bypass": "true" } });
  const ms = Math.round(performance.now() - t0);
  let result: StatusResult = { status: "NOT_FOUND" };
  try { result = await res.json(); } catch { /* empty */ }
  log("GET", url, res.status, ms, result.status);
  return { result, status: res.status };
}

export async function checkout(
  serverUrl: string,
  token: string,
  userId: string
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
  reason: "PAYMENT_FAILED" | "CANCELLED"
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
  log("POST", url, res.status, ms, "released");
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
