interface FlashEngineOptions {
    publicKey: string;
    signingSecret: string;
    apiUrl?: string;
    rsaPublicKey?: string;
    jwksCache?: boolean;
    requestTimeoutMs?: number;
}
interface VerifyResult {
    valid: true;
    userId: string;
    eventId: string;
    jti: string;
    test?: boolean;
}
interface ReleaseResult {
    released: true;
    stockRestored: number;
}
type ReleaseReason = 'EXPIRED' | 'CANCELLED' | 'PAYMENT_FAILED';
interface OfflineVerifyResult {
    userId: string;
    publicKey: string;
    eventId: string;
    jti: string;
    expiresAt: number;
    test?: boolean;
}
declare class FlashEngineError extends Error {
    readonly code: string;
    readonly statusCode?: number | undefined;
    constructor(message: string, code: string, statusCode?: number | undefined);
}

declare class FlashEngine {
    private options;
    private jwksClient;
    constructor(options: FlashEngineOptions);
    verifyToken(token: string): Promise<VerifyResult>;
    releaseTicket(jti: string, reason: ReleaseReason): Promise<ReleaseResult>;
    verifyTokenOffline(token: string): Promise<OfflineVerifyResult>;
}

interface HmacHeaders {
    'x-signature': string;
    'x-timestamp': string;
    'x-public-key': string;
}
declare function signRequest(body: object, signingSecret: string, publicKey: string): {
    headers: HmacHeaders;
    serializedBody: string;
};

declare class JwksClient {
    private apiUrl;
    private cachedKey;
    private cacheMaxAgeMs;
    constructor(apiUrl: string);
    getPublicKey(eventPublicKey: string): Promise<string>;
    clearCache(): void;
}
declare function verifyRS256(token: string, publicKeyPem: string): Record<string, unknown>;

export { FlashEngine, FlashEngineError, type FlashEngineOptions, type HmacHeaders, JwksClient, type OfflineVerifyResult, type ReleaseReason, type ReleaseResult, type VerifyResult, signRequest, verifyRS256 };
