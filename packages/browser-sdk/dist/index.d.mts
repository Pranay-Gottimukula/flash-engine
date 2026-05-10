import { F as FlashQueueEventMap, a as FlashQueueOptions, Q as QueueState } from './types-nfqu9WN5.mjs';
export { E as ErrorCode, b as ErrorPayload, J as JoinResponse, P as PausedPayload, c as PositionPayload, d as QueueInfoResponse, e as QueuedPayload, S as SoldOutPayload, f as StatusResponse, T as TicketExpiringPayload, W as WonPayload } from './types-nfqu9WN5.mjs';

type Listener<T> = (payload: T) => void;
declare class TypedEmitter<EventMap> {
    private listeners;
    on<K extends keyof EventMap & string>(event: K, listener: Listener<EventMap[K]>): this;
    off<K extends keyof EventMap & string>(event: K, listener: Listener<EventMap[K]>): this;
    protected emit<K extends keyof EventMap & string>(event: K, payload: EventMap[K]): void;
    removeAllListeners(): void;
}
declare class FlashQueue extends TypedEmitter<FlashQueueEventMap> {
    private options;
    private transport;
    private state;
    private pollTimer;
    private pollCount;
    private expiryTimer;
    private currentToken;
    private rateLimit;
    private visibilityListener;
    private pollBackoffMs;
    constructor(options: FlashQueueOptions);
    get currentState(): QueueState;
    join(): Promise<void>;
    destroy(): void;
    private estimateWait;
    private startPolling;
    private schedulePoll;
    private poll;
    private scheduleExpiryWarning;
    private parseExpiry;
    private jitteredInterval;
    private classifyError;
}

export { FlashQueue, FlashQueueEventMap, FlashQueueOptions, QueueState };
