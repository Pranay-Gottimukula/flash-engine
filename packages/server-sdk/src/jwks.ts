import { createPublicKey, createVerify } from 'node:crypto';
import { FlashEngineError } from './types.js';

interface JWK {
  kty: string;
  use: string;
  alg: string;
  kid: string;
  n: string;
  e: string;
}

function base64urlDecode(str: string): Buffer {
  const padded = str + '='.repeat((4 - (str.length % 4)) % 4);
  return Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

export class JwksClient {
  private apiUrl: string;
  private cachedKey: { pem: string; fetchedAt: number } | null = null;
  private cacheMaxAgeMs = 3_600_000; // 1 hour

  constructor(apiUrl: string) {
    this.apiUrl = apiUrl;
  }

  async getPublicKey(eventPublicKey: string): Promise<string> {
    const now = Date.now();
    if (this.cachedKey && now - this.cachedKey.fetchedAt < this.cacheMaxAgeMs) {
      return this.cachedKey.pem;
    }

    let res: Response;
    try {
      res = await fetch(`${this.apiUrl}/api/.well-known/jwks/${eventPublicKey}`);
    } catch (err) {
      throw new FlashEngineError(
        `JWKS fetch failed: ${(err as Error).message}`,
        'JWKS_FETCH_FAILED',
      );
    }

    if (!res.ok) {
      throw new FlashEngineError(
        `JWKS fetch failed with status ${res.status}`,
        'JWKS_FETCH_FAILED',
        res.status,
      );
    }

    let data: { keys: JWK[] };
    try {
      data = (await res.json()) as { keys: JWK[] };
    } catch {
      throw new FlashEngineError('JWKS response is not valid JSON', 'JWKS_FETCH_FAILED');
    }

    const jwk = data.keys.find((k) => k.kid === eventPublicKey);
    if (!jwk) {
      throw new FlashEngineError(
        `No JWK found for kid=${eventPublicKey}`,
        'JWKS_FETCH_FAILED',
      );
    }

    const keyObj = createPublicKey({ key: jwk as JsonWebKey, format: 'jwk' });
    const pem = keyObj.export({ type: 'spki', format: 'pem' }) as string;

    this.cachedKey = { pem, fetchedAt: now };
    return pem;
  }

  clearCache(): void {
    this.cachedKey = null;
  }
}

export function verifyRS256(token: string, publicKeyPem: string): Record<string, unknown> {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new FlashEngineError('Malformed JWT', 'TOKEN_INVALID');
  }
  const [headerB64, payloadB64, sigB64] = parts;

  const header = JSON.parse(base64urlDecode(headerB64).toString('utf8')) as Record<string, unknown>;
  if (header['alg'] !== 'RS256') {
    throw new FlashEngineError(`Unexpected algorithm: ${header['alg']}`, 'TOKEN_INVALID');
  }

  const payload = JSON.parse(base64urlDecode(payloadB64).toString('utf8')) as Record<string, unknown>;

  if (typeof payload['exp'] === 'number' && payload['exp'] * 1000 < Date.now()) {
    throw new FlashEngineError('Token expired', 'TOKEN_EXPIRED');
  }

  const verifier = createVerify('RSA-SHA256');
  verifier.update(`${headerB64}.${payloadB64}`);
  const valid = verifier.verify(publicKeyPem, base64urlDecode(sigB64));
  if (!valid) {
    throw new FlashEngineError('Invalid token signature', 'TOKEN_INVALID');
  }

  return payload;
}
