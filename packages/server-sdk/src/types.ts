export interface FlashEngineOptions {
  publicKey: string;
  signingSecret: string;
  apiUrl?: string;
  rsaPublicKey?: string;
  jwksCache?: boolean;
  requestTimeoutMs?: number;
}

export interface VerifyResult {
  valid: true;
  userId: string;
  eventId: string;
  jti: string;
  test?: boolean;
}

export interface ReleaseResult {
  released: true;
  stockRestored: number;
}

export type ReleaseReason = 'EXPIRED' | 'CANCELLED' | 'PAYMENT_FAILED';

export interface OfflineVerifyResult {
  userId: string;
  publicKey: string;
  eventId: string;
  jti: string;
  expiresAt: number;
  test?: boolean;
}

export class FlashEngineError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode?: number,
  ) {
    super(message);
    this.name = 'FlashEngineError';
  }
}
