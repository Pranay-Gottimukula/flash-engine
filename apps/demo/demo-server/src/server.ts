import dotenv from "dotenv";
import express, { Request, Response } from "express";
import cors from "cors";
import { FlashEngine, FlashEngineError } from "@flashengine/server";
import type { CheckoutBody, FailBody, WebhookBody } from "./types";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const ENGINE_API_URL       = process.env.ENGINE_API_URL       ?? "http://localhost:4000";
const EVENT_PUBLIC_KEY     = process.env.EVENT_PUBLIC_KEY     ?? "";
const EVENT_SIGNING_SECRET = process.env.EVENT_SIGNING_SECRET ?? "";
const PORT                 = process.env.PORT                 ?? "4001";

// ── SDK instance (used for release — signingSecret is event-specific) ─────────
const engine = new FlashEngine({
  publicKey:     EVENT_PUBLIC_KEY,
  signingSecret: EVENT_SIGNING_SECRET,
  apiUrl:        ENGINE_API_URL,
});

// Extract the pk claim from a JWT without verifying its signature.
// Used so verify calls always send the correct x-public-key header even when
// the demo client was opened with a different event's public key via URL param.
function extractPublicKeyFromToken(token: string): string | null {
  try {
    const payloadB64 = token.split('.')[1];
    if (!payloadB64) return null;
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    return typeof payload.pk === 'string' ? payload.pk : null;
  } catch {
    return null;
  }
}

// ── Colour helpers ────────────────────────────────────────────────────────────
const C = {
  reset:  "\x1b[0m",
  green:  (s: string) => `\x1b[32m${s}\x1b[0m`,
  red:    (s: string) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  cyan:   (s: string) => `\x1b[36m${s}\x1b[0m`,
  dim:    (s: string) => `\x1b[2m${s}\x1b[0m`,
};

// ── Pending winners (populated by webhook, consumed by /checkout) ─────────────
//
// Keyed by jti. The /checkout route can check this map to confirm the winner
// was pre-validated via webhook before calling verifyToken.
// Webhook URL to configure on the event: http://localhost:4001/webhook

export const pendingWinners = new Map<string, { jti: string; userId: string }>();

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

// ── POST /webhook ─────────────────────────────────────────────────────────────
//
// Receives Flash Engine lifecycle events. Always returns 200 so the engine
// does not retry unnecessarily.
app.post("/webhook", (req: Request, res: Response) => {
  try {
    const { event, eventId, userId, jti, timestamp } = req.body as WebhookBody;

    const ts = new Date().toLocaleTimeString("en-US", { hour12: false });
    console.log(`\n${C.dim(`[${ts}]`)} ${C.cyan("WEBHOOK")} event=${C.yellow(event ?? "(unknown)")} eventId=${eventId} timestamp=${timestamp}`);

    if (event === "ticket_issued" && jti) {
      pendingWinners.set(jti, { jti, userId: userId ?? "" });
      console.log(`  ${C.dim("→")} ${C.green(`ticket_issued: stored jti=${jti} userId=${userId ?? "(none)"}`)}`);
    }
  } catch (err) {
    console.error("[webhook] Failed to process body:", err);
  }

  res.status(200).json({ received: true });
});

// ── POST /api/checkout ────────────────────────────────────────────────────────
app.post("/api/checkout", async (req: Request, res: Response) => {
  const { token, userId } = req.body as CheckoutBody;

  const log = new RequestLog("POST", "/api/checkout");

  log.step(`userId: ${userId}`);
  log.step(`Verifying token with engine…`);

  // Use the token's pk claim so verify works regardless of which event the
  // demo client was opened with (e.g. via the SaaS dashboard URL param).
  const tokenPk = extractPublicKeyFromToken(token) ?? EVENT_PUBLIC_KEY;
  const verifyEngine = tokenPk === EVENT_PUBLIC_KEY
    ? engine
    : new FlashEngine({ publicKey: tokenPk, signingSecret: EVENT_SIGNING_SECRET, apiUrl: ENGINE_API_URL });

  console.log(
    C.dim(`  [debug] SDK publicKey="${tokenPk.slice(0, 14)}…"  token="${token.slice(0, 50)}…"`)
  );

  let jti: string;
  try {
    const result = await verifyEngine.verifyToken(token);
    jti = result.jti;
    log.step(`Engine responded: 200 { valid: true, jti: ${jti} }`, C.green);
  } catch (err) {
    if (err instanceof FlashEngineError) {
      if (err.code === "TOKEN_USED") {
        log.step(`Engine responded: 409 TOKEN_ALREADY_USED`, C.red);
        log.done("Double-spend prevented!", false);
        logStore[0] && (logStore[0].route = "/api/checkout (DUPLICATE)");
        res.status(409).json({ error: "TOKEN_ALREADY_USED", message: "This purchase token has already been redeemed." });
        return;
      }
      if (err.code === "PK_MISMATCH" || err.code === "INVALID_TOKEN") {
        log.step(`Engine responded: ${err.statusCode ?? 400} (invalid/expired token)`, C.red);
        log.done("Token invalid or expired", false);
        res.status(400).json({ error: "INVALID_TOKEN", message: "Invalid or expired token." });
        return;
      }
      if (err.code === "NETWORK_ERROR") {
        log.done(`Engine unreachable: ${err.message}`, false);
        res.status(500).json({ error: "ENGINE_UNREACHABLE", message: err.message });
        return;
      }
      log.step(`Engine responded: ${err.statusCode ?? 500} ${err.message}`, C.red);
      log.done(`Unexpected engine error (${err.statusCode ?? 500})`, false);
      res.status(500).json({ error: "ENGINE_ERROR", message: err.message, status: err.statusCode });
      return;
    }
    const msg = err instanceof Error ? err.message : String(err);
    log.done(`Engine unreachable: ${msg}`, false);
    res.status(500).json({ error: "ENGINE_UNREACHABLE", message: msg });
    return;
  }

  const delay = 1000 + Math.random() * 1000;
  log.step(`Simulating payment (${(delay / 1000).toFixed(1)}s delay)…`);
  await new Promise<void>((r) => setTimeout(r, delay));

  const orderId = "ORD-" + Math.floor(100_000 + Math.random() * 900_000);
  log.done(`Order confirmed: ${orderId}`, true);
  res.status(200).json({ success: true, orderId, message: "Payment successful!" });
});

// ── POST /api/checkout/fail ───────────────────────────────────────────────────
app.post("/api/checkout/fail", async (req: Request, res: Response) => {
  const { jti, reason } = req.body as FailBody;

  const log = new RequestLog("POST", "/api/checkout/fail");

  log.step(`jti: ${jti}  reason: ${reason}`);
  log.step("Calling engine /api/queue/release via SDK…", C.yellow);

  try {
    const result = await engine.releaseTicket(jti, reason);
    log.step(`Engine responded: 200 ${JSON.stringify(result)}`, C.green);
    log.done("Stock released back to pool", true);
    res.status(200).json(result);
  } catch (err) {
    if (err instanceof FlashEngineError) {
      log.step(`Engine responded: ${err.statusCode ?? 500} ${err.message}`, C.red);
      log.done(`Release failed (${err.statusCode ?? 500})`, false);
      res.status(err.statusCode ?? 500).json({ error: err.code, message: err.message });
      return;
    }
    const msg = err instanceof Error ? err.message : String(err);
    log.done(`Engine unreachable: ${msg}`, false);
    res.status(500).json({ error: "ENGINE_UNREACHABLE", message: msg });
  }
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
    `  SDK: @flashengine/server`,
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
