import crypto from "crypto";
import dotenv from "dotenv";
import express, { Request, Response } from "express";
import cors from "cors";
import type { CheckoutBody, FailBody, VerifyResponse } from "./types";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const ENGINE_API_URL    = process.env.ENGINE_API_URL       ?? "http://localhost:3000";
const EVENT_PUBLIC_KEY  = process.env.EVENT_PUBLIC_KEY     ?? "";
const EVENT_SIGNING_SECRET = process.env.EVENT_SIGNING_SECRET ?? "";
const PORT              = process.env.PORT                 ?? "4000";

// ── Colour helpers ────────────────────────────────────────────────────────────
const C = {
  reset:  "\x1b[0m",
  green:  (s: string) => `\x1b[32m${s}\x1b[0m`,
  red:    (s: string) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  cyan:   (s: string) => `\x1b[36m${s}\x1b[0m`,
  dim:    (s: string) => `\x1b[2m${s}\x1b[0m`,
};

// ── Log store ─────────────────────────────────────────────────────────────────

interface LogRecord {
  id:      number;
  ts:      string;
  method:  string;
  route:   string;
  lines:   string[];
  success: boolean;
  totalMs: number;
}

let logSeq = 0;
const logStore: LogRecord[] = [];
const MAX_LOGS = 50;

class RequestLog {
  private t0      = Date.now();
  private record: LogRecord;

  constructor(method: string, route: string, tag?: string) {
    const ts    = new Date().toLocaleTimeString("en-US", { hour12: false });
    const label = tag ? C.yellow(` (${tag})`) : "";
    this.record = { id: ++logSeq, ts, method, route, lines: [], success: false, totalMs: 0 };
    console.log(`\n${C.dim(`[${ts}]`)} ${C.cyan(method)} ${route}${label}`);
  }

  step(msg: string, color: (s: string) => string = C.cyan) {
    this.record.lines.push(msg);
    console.log(`  ${C.dim("→")} ${color(msg)}`);
    return this;
  }

  done(msg: string, ok = true) {
    this.record.success = ok;
    this.record.totalMs = Date.now() - this.t0;
    const icon = ok ? C.green("✅") : C.red("❌");
    const tail = C.dim(`(${this.record.totalMs}ms total)`);
    const line = `${msg} ${tail}`;
    this.record.lines.push(line);
    console.log(`  ${icon} ${ok ? C.green(msg) : C.red(msg)} ${tail}`);
    logStore.unshift(this.record);
    if (logStore.length > MAX_LOGS) logStore.pop();
  }
}

// ── POST /api/checkout ────────────────────────────────────────────────────────
app.post("/api/checkout", async (req: Request, res: Response) => {
  const { token, userId } = req.body as CheckoutBody;

  // Peek at whether this is likely a double-spend (token already used)
  const log = new RequestLog("POST", "/api/checkout");

  log.step(`userId: ${userId}`);
  log.step(`Verifying token with engine…`);

  let verifyRes: globalThis.Response;
  try {
    verifyRes = await fetch(`${ENGINE_API_URL}/api/queue/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-public-key": EVENT_PUBLIC_KEY },
      body: JSON.stringify({ token }),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.done(`Engine unreachable: ${msg}`, false);
    res.status(500).json({ error: "ENGINE_UNREACHABLE", message: msg });
    return;
  }

  const status = verifyRes.status;

  if (status === 200) {
    let body: VerifyResponse = {};
    try { body = await verifyRes.json() as VerifyResponse; } catch { /* empty */ }
    log.step(`Engine responded: 200 { valid: true, jti: ${body.jti ?? "?"} }`, C.green);

    const delay = 1000 + Math.random() * 1000;
    log.step(`Simulating payment (${(delay / 1000).toFixed(1)}s delay)…`);
    await new Promise<void>((r) => setTimeout(r, delay));

    const orderId = "ORD-" + Math.floor(100_000 + Math.random() * 900_000);
    log.done(`Order confirmed: ${orderId}`, true);
    res.status(200).json({ success: true, orderId, message: "Payment successful!" });
    return;
  }

  if (status === 409) {
    let body: unknown;
    try { body = await verifyRes.json(); } catch { body = {}; }
    log.step(`Engine responded: 409 ${JSON.stringify(body)}`, C.red);
    log.done("Double-spend prevented!", false);

    // Re-tag this log record as DUPLICATE for clarity
    logStore[0] && (logStore[0].route = "/api/checkout (DUPLICATE)");

    res.status(409).json({ error: "TOKEN_ALREADY_USED", message: "This purchase token has already been redeemed." });
    return;
  }

  if (status === 400 || status === 401) {
    log.step(`Engine responded: ${status} (invalid/expired token)`, C.red);
    log.done("Token invalid or expired", false);
    res.status(400).json({ error: "INVALID_TOKEN", message: "Invalid or expired token." });
    return;
  }

  let upstream: unknown;
  try { upstream = await verifyRes.json(); } catch { upstream = {}; }
  log.step(`Engine responded: ${status} ${JSON.stringify(upstream)}`, C.red);
  log.done(`Unexpected engine error (${status})`, false);
  res.status(500).json({ error: "ENGINE_ERROR", upstream, status });
});

// ── POST /api/checkout/fail ───────────────────────────────────────────────────
app.post("/api/checkout/fail", async (req: Request, res: Response) => {
  const { jti, reason } = req.body as FailBody;

  const log = new RequestLog("POST", "/api/checkout/fail");

  log.step(`jti: ${jti}  reason: ${reason}`);
  log.step("Constructing HMAC…", C.yellow);

  const bodyStr   = JSON.stringify({ jti, reason });
  const timestamp = Date.now().toString();
  const message   = `${timestamp}.${bodyStr}`;
  const signature = crypto
    .createHmac("sha256", EVENT_SIGNING_SECRET)
    .update(message)
    .digest("hex");

  log.step(`Timestamp : ${timestamp}`, C.yellow);
  log.step(`Message   : ${message.slice(0, 80)}${message.length > 80 ? "…" : ""}`, C.yellow);
  log.step(`Signature : sha256=${signature}`, C.yellow);
  log.step(`Calling engine /api/queue/release…`);

  let releaseRes: globalThis.Response;
  try {
    releaseRes = await fetch(`${ENGINE_API_URL}/api/queue/release`, {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "x-public-key":  EVENT_PUBLIC_KEY,
        "x-signature":   `sha256=${signature}`,
        "x-timestamp":   timestamp,
      },
      body: bodyStr,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.done(`Engine unreachable: ${msg}`, false);
    res.status(500).json({ error: "ENGINE_UNREACHABLE", message: msg });
    return;
  }

  const releaseStatus = releaseRes.status;
  let releaseBody: unknown;
  try { releaseBody = await releaseRes.json(); } catch { releaseBody = {}; }

  if (releaseStatus >= 200 && releaseStatus < 300) {
    log.step(`Engine responded: ${releaseStatus} ${JSON.stringify(releaseBody)}`, C.green);
    log.done("Stock released back to pool", true);
  } else {
    log.step(`Engine responded: ${releaseStatus} ${JSON.stringify(releaseBody)}`, C.red);
    log.done(`Release failed (${releaseStatus})`, false);
  }

  res.status(releaseStatus).json(releaseBody);
});

// ── GET /api/health ───────────────────────────────────────────────────────────
app.get("/api/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", engineUrl: ENGINE_API_URL, eventConfigured: !!EVENT_PUBLIC_KEY });
});

// ── GET /api/logs ─────────────────────────────────────────────────────────────
app.get("/api/logs", (_req: Request, res: Response) => {
  res.json({ logs: logStore, total: logStore.length });
});

// ── Startup banner ────────────────────────────────────────────────────────────
function printBanner() {
  const pkShort  = EVENT_PUBLIC_KEY  ? EVENT_PUBLIC_KEY.slice(0, 14) + "…"  : "(not set — add to .env)";
  const secOk    = EVENT_SIGNING_SECRET ? "✓ set" : "✗ not set — HMAC will fail";

  const lines = [
    "  FlashEngine Demo Server",
    `  Listening on port ${PORT}`,
    `  Engine: ${ENGINE_API_URL}`,
    `  PubKey: ${pkShort}`,
    `  Secret: ${secOk}`,
  ];

  const width  = Math.max(...lines.map((l) => l.length)) + 2;
  const bar    = "─".repeat(width);
  const pad    = (s: string) => s + " ".repeat(width - s.length);

  const border = C.green;
  console.log("");
  console.log(border(`┌${bar}┐`));
  for (const l of lines) console.log(border("│") + pad(l) + border("│"));
  console.log(border(`└${bar}┘`));
  console.log("");
}

app.listen(Number(PORT), printBanner);
