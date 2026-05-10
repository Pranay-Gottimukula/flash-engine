interface FlashQueueOptions {
    publicKey: string;
    userId: string;
    apiUrl?: string;
    pollIntervalMs?: number;
    maxPollRetries?: number;
    debug?: boolean;
}
interface QueuedPayload {
    position: number;
    estimatedWaitMs: number;
}
interface WonPayload {
    token: string;
    expiresAt: number;
}
interface SoldOutPayload {
}
interface PausedPayload {
    retryAfter: number;
}
interface PositionPayload {
    position: number;
    estimatedWaitMs: number;
}
interface TicketExpiringPayload {
    token: string;
    expiresInMs: number;
}
interface ErrorPayload {
    code: ErrorCode;
    message: string;
}
type ErrorCode = 'NETWORK_ERROR' | 'EVENT_NOT_FOUND' | 'EVENT_NOT_ACTIVE' | 'POLL_TIMEOUT' | 'UNKNOWN';
interface FlashQueueEventMap {
    queued: QueuedPayload;
    won: WonPayload;
    sold_out: SoldOutPayload;
    paused: PausedPayload;
    position: PositionPayload;
    ticket_expiring: TicketExpiringPayload;
    error: ErrorPayload;
}
type QueueState = 'idle' | 'joining' | 'queued' | 'won' | 'sold_out' | 'paused' | 'error' | 'destroyed';
interface JoinResponse {
    status: 'WON' | 'QUEUED' | 'SOLD_OUT' | 'ALREADY_JOINED' | 'PAUSED';
    token?: string;
    position?: number;
    pollUrl?: string;
    pollIntervalMs?: number;
    retryAfter?: number;
    message?: string;
}
interface StatusResponse {
    status: 'WON' | 'QUEUED' | 'SOLD_OUT';
    token?: string;
    tokenExpired?: boolean;
    position?: number;
}
interface QueueInfoResponse {
    status: string;
    queueLength: number;
    rateLimit: number;
    estimatedWaitMs: number;
}

export type { ErrorCode as E, FlashQueueEventMap as F, JoinResponse as J, PausedPayload as P, QueueState as Q, SoldOutPayload as S, TicketExpiringPayload as T, WonPayload as W, FlashQueueOptions as a, ErrorPayload as b, PositionPayload as c, QueueInfoResponse as d, QueuedPayload as e, StatusResponse as f };
