import rateLimit from 'express-rate-limit';
import { Request } from 'express';

// Allow the demo simulator (same-IP, multi-user) to bypass per-route limiters
// in non-production environments via a custom request header.
function isDemoBypass(req: Request): boolean {
  return (
    process.env.NODE_ENV !== 'production' &&
    req.headers['x-demo-bypass'] === 'true'
  );
}

export const queueJoinLimiter = rateLimit({
  windowMs: 10 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip ?? 'unknown',
  skip: isDemoBypass,
  message: {
    error: 'RATE_LIMITED',
    message: 'Too many requests. Please try again shortly.',
    retryAfter: 10,
  },
});

export const queueStatusLimiter = rateLimit({
  windowMs: 2 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip ?? 'unknown',
  skip: isDemoBypass,
  message: {
    error: 'RATE_LIMITED',
    message: 'Polling too fast. Slow down.',
    retryAfter: 2,
  },
});

export const queueInfoLimiter = rateLimit({
  windowMs: 5 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip ?? 'unknown',
  skip: isDemoBypass,
  message: {
    error: 'RATE_LIMITED',
    message: 'Too many info requests. Please slow down.',
    retryAfter: 5,
  },
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip ?? 'unknown',
  message: {
    error: 'RATE_LIMITED',
    message: 'Too many login attempts. Try again later.',
    retryAfter: 900,
  },
});
