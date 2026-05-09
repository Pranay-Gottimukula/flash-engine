export interface FlashQueueOptions {
  publicKey: string;
  userId: string;
  apiUrl?: string;
  pollIntervalMs?: number;
  maxPollRetries?: number;
  debug?: boolean;
}

export interface QueuedPayload {
  position: number;
  estimatedWaitMs: number;
}

export interface WonPayload {
  token: string;
  expiresAt: number;
}

export interface SoldOutPayload {}

export interface PausedPayload {
  retryAfter: number;
}

export interface PositionPayload {
  position: number;
  estimatedWaitMs: number;
}

export interface TicketExpiringPayload {
  token: string;
  expiresInMs: number;
}

export interface ErrorPayload {
  code: ErrorCode;
  message: string;
}

export type ErrorCode =
  | 'NETWORK_ERROR'
  | 'EVENT_NOT_FOUND'
  | 'EVENT_NOT_ACTIVE'
  | 'POLL_TIMEOUT'
  | 'UNKNOWN';

export interface FlashQueueEventMap {
  queued: QueuedPayload;
  won: WonPayload;
  sold_out: SoldOutPayload;
  paused: PausedPayload;
  position: PositionPayload;
  ticket_expiring: TicketExpiringPayload;
  error: ErrorPayload;
}

export type QueueState =
  | 'idle'
  | 'joining'
  | 'queued'
  | 'won'
  | 'sold_out'
  | 'paused'
  | 'error'
  | 'destroyed';

export interface JoinResponse {
  status: 'WON' | 'QUEUED' | 'SOLD_OUT' | 'ALREADY_JOINED' | 'PAUSED';
  token?: string;
  position?: number;
  pollUrl?: string;
  pollIntervalMs?: number;
  retryAfter?: number;
  message?: string;
}

export interface StatusResponse {
  status: 'WON' | 'QUEUED' | 'SOLD_OUT';
  token?: string;
  tokenExpired?: boolean;
  position?: number;
}

export interface QueueInfoResponse {
  status: string;
  queueLength: number;
  rateLimit: number;
  estimatedWaitMs: number;
}
