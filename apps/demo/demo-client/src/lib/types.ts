export type AppState =
  | "config"
  | "product"
  | "queue"
  | "checkout"
  | "confirmed"
  | "soldout"
  | "released";

export type EventStatus = "ACTIVE" | "PENDING" | "ENDED" | "PAUSED";

export interface Config {
  engineUrl: string;
  serverUrl: string;
  publicKey: string;
}

export interface QueueInfo {
  stock: number;
  queueLength: number;
  rateLimit: number;
  estimatedWaitMs: number;
  status?: EventStatus;
}

export interface JoinResult {
  status: "WON" | "QUEUED" | "SOLD_OUT";
  token?: string;
  position?: number;
  estimatedWaitMs?: number;
  rateLimit?: number;
}

export interface StatusResult {
  status: "WON" | "QUEUED" | "SOLD_OUT" | "NOT_FOUND";
  token?: string;
  position?: number;
}

export interface CheckoutResult {
  success: boolean;
  orderId?: string;
  message?: string;
  error?: string;
}

export interface ReleaseResult {
  released?: boolean;
  stockRestored?: number;
  [key: string]: unknown;
}

export interface DebugEntry {
  id: string;
  ts: string;
  method: string;
  url: string;
  status: number;
  ms: number;
  label?: string;
  category: "success" | "queue" | "error" | "info";
}

export interface TokenPayload {
  jti: string;
  sub: string;
  exp: number;
  iat: number;
}
