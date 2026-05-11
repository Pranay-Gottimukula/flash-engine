export interface CheckoutBody {
  token: string;
  userId: string;
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
