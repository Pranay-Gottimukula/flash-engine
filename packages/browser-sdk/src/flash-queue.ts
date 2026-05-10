import type {
  FlashQueueOptions,
  FlashQueueEventMap,
  QueueState,
  ErrorCode,
} from './types';
import { Transport } from './transport';

type Listener<T> = (payload: T) => void;

class TypedEmitter<EventMap> {
  private listeners = new Map<string, Set<Function>>();

  on<K extends keyof EventMap & string>(event: K, listener: Listener<EventMap[K]>): this {
    let set = this.listeners.get(event);
    if (!set) { set = new Set(); this.listeners.set(event, set); }
    set.add(listener);
    return this;
  }

  off<K extends keyof EventMap & string>(event: K, listener: Listener<EventMap[K]>): this {
    this.listeners.get(event)?.delete(listener);
    return this;
  }

  protected emit<K extends keyof EventMap & string>(event: K, payload: EventMap[K]): void {
    this.listeners.get(event)?.forEach(fn => fn(payload));
  }

  removeAllListeners(): void {
    this.listeners.clear();
  }
}

export class FlashQueue extends TypedEmitter<FlashQueueEventMap> {
  private options: Required<FlashQueueOptions>;
  private transport: Transport;
  private state: QueueState = 'idle';
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private pollCount = 0;
  private expiryTimer: ReturnType<typeof setTimeout> | null = null;
  private currentToken: string | null = null;
  private rateLimit = 50;
  private visibilityListener: (() => void) | null = null;
  private pollBackoffMs = 0; // extra delay added after a fetch error during polling

  constructor(options: FlashQueueOptions) {
    super();
    this.options = {
      apiUrl: 'https://api.flashengine.dev',
      pollIntervalMs: 2000,
      maxPollRetries: 100,
      debug: false,
      ...options,
    };
    this.transport = new Transport({
      apiUrl: this.options.apiUrl,
      debug: this.options.debug,
    });
  }

  get currentState(): QueueState { return this.state; }

  async join(): Promise<void> {
    if (this.state !== 'idle') {
      throw new Error('Already joined. Call destroy() first.');
    }
    this.state = 'joining';

    // Best-effort prefetch of queue info for rateLimit
    this.transport.info(this.options.publicKey).then(info => {
      this.rateLimit = info.rateLimit;
    }).catch(() => { /* use default */ });

    try {
      const res = await this.transport.join(this.options.publicKey, this.options.userId);

      switch (res.status) {
        case 'WON': {
          const token = res.token!;
          const expiresAt = this.parseExpiry(token);
          this.state = 'won';
          this.currentToken = token;
          this.emit('won', { token, expiresAt });
          this.scheduleExpiryWarning(token);
          break;
        }
        case 'SOLD_OUT':
          this.state = 'sold_out';
          this.emit('sold_out', {});
          break;

        case 'QUEUED': {
          this.state = 'queued';
          const position = res.position ?? 0;
          const estimatedWaitMs = this.estimateWait(position);
          if (res.pollIntervalMs) this.options.pollIntervalMs = res.pollIntervalMs;
          this.emit('queued', { position, estimatedWaitMs });
          this.startPolling();
          break;
        }
        case 'ALREADY_JOINED':
          this.state = 'queued';
          this.startPolling();
          break;

        case 'PAUSED': {
          this.state = 'paused';
          const retryAfter = res.retryAfter ?? 30;
          this.emit('paused', { retryAfter });
          this.pollTimer = setTimeout(() => {
            this.state = 'idle';
            this.join().catch(() => { /* error already emitted inside join */ });
          }, retryAfter * 1000);
          break;
        }
      }
    } catch (err) {
      if ((this.state as QueueState) === 'destroyed') return;
      this.state = 'error';
      const [code, message] = this.classifyError(err);
      this.emit('error', { code, message });
    }
  }

  destroy(): void {
    this.state = 'destroyed';
    if (this.pollTimer !== null) { clearTimeout(this.pollTimer); this.pollTimer = null; }
    if (this.expiryTimer !== null) { clearTimeout(this.expiryTimer); this.expiryTimer = null; }
    if (this.visibilityListener) {
      document.removeEventListener('visibilitychange', this.visibilityListener);
      this.visibilityListener = null;
    }
    this.transport.abort();
    this.removeAllListeners();
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private estimateWait(position: number): number {
    return position * (1000 / this.rateLimit);
  }

  private startPolling(): void {
    // Remove any existing visibility listener before adding a new one
    if (this.visibilityListener) {
      document.removeEventListener('visibilitychange', this.visibilityListener);
    }

    this.visibilityListener = () => {
      if (typeof document === 'undefined') return;
      if (document.visibilityState === 'hidden') {
        if (this.pollTimer !== null) { clearTimeout(this.pollTimer); this.pollTimer = null; }
      } else {
        // Tab became visible — poll immediately then resume normal schedule
        this.schedulePoll(0);
      }
    };

    document.addEventListener('visibilitychange', this.visibilityListener);
    this.schedulePoll(this.jitteredInterval());
  }

  private schedulePoll(delayMs: number): void {
    if (this.pollTimer !== null) clearTimeout(this.pollTimer);
    this.pollTimer = setTimeout(() => this.poll(), delayMs);
  }

  private async poll(): Promise<void> {
    if ((this.state as QueueState) === 'destroyed') return;

    // Pause polling when tab is hidden; the visibilitychange handler will resume
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;

    this.pollCount++;
    if (this.pollCount >= this.options.maxPollRetries) {
      this.state = 'error';
      this.emit('error', { code: 'POLL_TIMEOUT', message: 'Max poll retries exceeded' });
      return;
    }

    try {
      const res = await this.transport.status(this.options.publicKey, this.options.userId);
      this.pollBackoffMs = 0; // reset on success

      if ((this.state as QueueState) === 'destroyed') return;

      switch (res.status) {
        case 'WON':
          if (res.tokenExpired) {
            this.state = 'error';
            this.emit('error', { code: 'UNKNOWN', message: 'Token expired before collection' });
            return;
          }
          {
            const token = res.token!;
            const expiresAt = this.parseExpiry(token);
            this.state = 'won';
            this.currentToken = token;
            this.emit('won', { token, expiresAt });
            this.scheduleExpiryWarning(token);
          }
          return; // stop polling

        case 'SOLD_OUT':
          this.state = 'sold_out';
          this.emit('sold_out', {});
          return; // stop polling

        case 'QUEUED': {
          const position = res.position ?? 0;
          const estimatedWaitMs = this.estimateWait(position);
          this.emit('position', { position, estimatedWaitMs });
          this.schedulePoll(this.jitteredInterval());
          break;
        }
      }
    } catch (err) {
      if ((this.state as QueueState) === 'destroyed') return;

      const [code, message] = this.classifyError(err);
      this.emit('error', { code, message });

      // Don't stop — backoff and schedule next poll
      this.pollBackoffMs = Math.min(
        (this.pollBackoffMs || this.options.pollIntervalMs) * 2,
        30_000,
      );
      this.schedulePoll(this.pollBackoffMs);
    }
  }

  private scheduleExpiryWarning(token: string): void {
    const exp = this.parseExpiry(token);
    const fireInMs = exp - Date.now() - 60_000;
    if (fireInMs <= 0) {
      this.emit('ticket_expiring', { token, expiresInMs: Math.max(0, exp - Date.now()) });
      return;
    }
    this.expiryTimer = setTimeout(() => {
      this.emit('ticket_expiring', { token, expiresInMs: 60_000 });
    }, fireInMs);
  }

  private parseExpiry(token: string): number {
    try {
      const payload = token.split('.')[1];
      const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: number };
      if (decoded.exp) return decoded.exp * 1000;
    } catch { /* fall through */ }
    // Fallback: 10 minutes from now
    return Date.now() + 10 * 60 * 1000;
  }

  private jitteredInterval(): number {
    return this.options.pollIntervalMs + (Math.random() * 1000 - 500);
  }

  private classifyError(err: unknown): [ErrorCode, string] {
    if (err instanceof Error) {
      if ('code' in err && (err as { code: string }).code === 'NETWORK_ERROR') {
        return ['NETWORK_ERROR', err.message];
      }
      if (err.name === 'AbortError') return ['NETWORK_ERROR', 'Request aborted'];
      return ['UNKNOWN', err.message];
    }
    return ['UNKNOWN', 'An unknown error occurred'];
  }
}
