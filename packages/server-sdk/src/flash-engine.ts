import { signRequest } from './hmac.js';
import { JwksClient, verifyRS256 } from './jwks.js';
import type {
  FlashEngineOptions,
  VerifyResult,
  ReleaseResult,
  ReleaseReason,
  OfflineVerifyResult,
} from './types.js';
import { FlashEngineError } from './types.js';

export class FlashEngine {
  private options: Required<Omit<FlashEngineOptions, 'rsaPublicKey'>> & { rsaPublicKey?: string };
  private jwksClient: JwksClient;

  constructor(options: FlashEngineOptions) {
    this.options = {
      apiUrl: 'https://api.flashengine.dev',
      jwksCache: true,
      requestTimeoutMs: 10_000,
      ...options,
    };
    this.jwksClient = new JwksClient(this.options.apiUrl);
  }

  async verifyToken(token: string): Promise<VerifyResult> {
    let res: Response;
    try {
      res = await fetch(`${this.options.apiUrl}/api/queue/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-public-key': this.options.publicKey,
        },
        body: JSON.stringify({ token }),
        signal: AbortSignal.timeout(this.options.requestTimeoutMs),
      });
    } catch (err) {
      throw new FlashEngineError(
        `Network error: ${(err as Error).message}`,
        'NETWORK_ERROR',
      );
    }

    if (res.ok) {
      const data = (await res.json()) as VerifyResult;
      return { valid: true, userId: data.userId, eventId: data.eventId, jti: data.jti, test: data.test };
    }

    const msg = await res.text().catch(() => res.statusText);
    switch (res.status) {
      case 400: throw new FlashEngineError('Public key mismatch', 'PK_MISMATCH', 400);
      case 401: throw new FlashEngineError('Invalid token', 'INVALID_TOKEN', 401);
      case 409: throw new FlashEngineError('Token already used', 'TOKEN_USED', 409);
      default:  throw new FlashEngineError(msg, 'VERIFY_FAILED', res.status);
    }
  }

  async releaseTicket(jti: string, reason: ReleaseReason): Promise<ReleaseResult> {
    const body = { jti, reason };
    const { headers, serializedBody } = signRequest(body, this.options.signingSecret, this.options.publicKey);

    let res: Response;
    try {
      res = await fetch(`${this.options.apiUrl}/api/queue/release`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: serializedBody,
        signal: AbortSignal.timeout(this.options.requestTimeoutMs),
      });
    } catch (err) {
      throw new FlashEngineError(
        `Network error: ${(err as Error).message}`,
        'NETWORK_ERROR',
      );
    }

    if (res.ok) {
      const data = (await res.json()) as { stockRestored: number };
      return { released: true, stockRestored: data.stockRestored };
    }

    const msg = await res.text().catch(() => res.statusText);
    switch (res.status) {
      case 401: throw new FlashEngineError('HMAC verification failed', 'HMAC_FAILED', 401);
      case 404: throw new FlashEngineError('Ticket not found', 'TICKET_NOT_FOUND', 404);
      case 409: throw new FlashEngineError('Already released', 'ALREADY_RELEASED', 409);
      default:  throw new FlashEngineError(msg, 'RELEASE_FAILED', res.status);
    }
  }

  async verifyTokenOffline(token: string): Promise<OfflineVerifyResult> {
    const pem = this.options.rsaPublicKey
      ? this.options.rsaPublicKey
      : await this.jwksClient.getPublicKey(this.options.publicKey);

    const payload = verifyRS256(token, pem);

    return {
      userId:    payload['sub'] as string,
      publicKey: payload['pk'] as string,
      eventId:   payload['eid'] as string,
      jti:       payload['jti'] as string,
      expiresAt: payload['exp'] as number,
      test:      payload['test'] as boolean | undefined,
    };
  }
}
