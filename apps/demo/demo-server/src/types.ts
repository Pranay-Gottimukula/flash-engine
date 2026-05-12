export interface CheckoutBody {
  token: string;
  userId: string;
}

export interface WebhookBody {
  event:     string;
  eventId:   string;
  publicKey?: string;
  userId?:   string;
  jti?:      string;
  timestamp: string;
}

export interface FailBody {
  jti: string;
  reason: "PAYMENT_FAILED" | "CANCELLED";
}

export interface VerifyResponse {
  valid?: boolean;
  jti?: string;
  userId?: string;
}
