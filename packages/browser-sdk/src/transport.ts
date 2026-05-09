import type { JoinResponse, StatusResponse, QueueInfoResponse, ErrorCode } from './types';

export interface TransportOptions {
  apiUrl: string;
  debug: boolean;
}

class FlashNetworkError extends Error {
  code: ErrorCode;
  constructor(message: string) {
    super(message);
    this.code = 'NETWORK_ERROR';
  }
}

export class Transport {
  private apiUrl: string;
  private debug: boolean;
  private controller: AbortController | null = null;

  constructor(options: TransportOptions) {
    this.apiUrl = options.apiUrl;
    this.debug = options.debug;
  }

  async join(publicKey: string, userId: string): Promise<JoinResponse> {
    return this.request<JoinResponse>(`${this.apiUrl}/api/queue/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ publicKey, userId }),
    });
  }

  async status(publicKey: string, userId: string): Promise<StatusResponse> {
    return this.request<StatusResponse>(
      `${this.apiUrl}/api/queue/status?pk=${publicKey}&userId=${encodeURIComponent(userId)}`
    );
  }

  async info(publicKey: string): Promise<QueueInfoResponse> {
    return this.request<QueueInfoResponse>(
      `${this.apiUrl}/api/queue/info?pk=${publicKey}`
    );
  }

  abort(): void {
    if (this.controller) {
      this.controller.abort();
      this.controller = null;
    }
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const MAX_RETRIES = 3;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      this.controller = new AbortController();

      // Timeout: prefer AbortSignal.timeout, fall back to manual setTimeout
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      let signal: AbortSignal;
      if (typeof AbortSignal.timeout === 'function') {
        // Combine the caller's abort signal with the timeout signal
        const timeoutSignal = AbortSignal.timeout(10_000);
        const { signal: controllerSignal } = this.controller;
        // AbortSignal.any is baseline 2024; guard for older browsers
        signal = typeof AbortSignal.any === 'function'
          ? AbortSignal.any([controllerSignal, timeoutSignal])
          : controllerSignal;
        if (signal === controllerSignal) {
          // Fallback: wire timeout manually when AbortSignal.any unavailable
          timeoutId = setTimeout(() => this.controller?.abort(), 10_000);
        }
      } else {
        signal = this.controller.signal;
        timeoutId = setTimeout(() => this.controller?.abort(), 10_000);
      }

      if (this.debug) {
        console.log(`[FlashEngine] ${options.method ?? 'GET'} ${path}`);
      }

      try {
        const res = await fetch(path, { ...options, signal });

        if (timeoutId !== null) clearTimeout(timeoutId);

        if (this.debug) {
          console.log(`[FlashEngine] ${res.status} ${path}`);
        }

        if (!res.ok) {
          let message = `HTTP ${res.status}`;
          try {
            const body = await res.json() as { message?: string };
            if (body.message) message = body.message;
          } catch {
            // ignore parse failure; use the default message
          }
          throw new Error(message);
        }

        return res.json() as Promise<T>;
      } catch (err) {
        if (timeoutId !== null) clearTimeout(timeoutId);

        // If this abort came from destroy() (controller is now null) — don't retry
        if (err instanceof Error && err.name === 'AbortError' && this.controller === null) {
          throw err;
        }

        const isRetryable =
          (err instanceof TypeError) ||
          (err instanceof Error && err.name === 'AbortError');

        if (isRetryable && attempt < MAX_RETRIES) {
          const baseMs = 1000 * Math.pow(2, attempt); // 1s, 2s, 4s
          const jitteredMs = baseMs * (0.5 + Math.random());
          await new Promise(r => setTimeout(r, jitteredMs));
          continue;
        }

        if (isRetryable) {
          throw new FlashNetworkError(
            err instanceof Error ? err.message : 'Network request failed'
          );
        }

        // Non-retryable HTTP error — propagate as-is
        throw err;
      }
    }

    // Unreachable, but satisfies TypeScript
    throw new FlashNetworkError('Network request failed');
  }
}
