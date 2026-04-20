// apps/engine-gateway/src/controllers/release.controller.ts

import { Request, Response } from 'express';
import crypto                from 'crypto';
import redis                 from '../services/redis.service';
import prisma                from '../lib/prisma';
import { getEventEntry }     from '../services/event-cache.service';

// ── POST /api/queue/release ───────────────────────────────────────────────────
//
// Called by the CLIENT'S BACKEND when a winning ticket expires unused.
// Puts one unit of stock back into the Redis counter so another user can win.
//
// WHY THIS NEEDS HMAC AUTHENTICATION:
//   Without it, anyone who knows this URL can spam fake release requests
//   and inflate the stock counter beyond the original stockCount.
//   That means more winners than inventory — exactly what we're built to prevent.
//
// REQUEST:
//   POST /api/queue/release
//   Headers:
//     x-public-key:    pk_live_...
//     x-signature:     sha256=<hmac hex>
//     x-timestamp:     <unix ms>
//   Body:
//     { jti: string, reason: "EXPIRED" | "CANCELLED" | "PAYMENT_FAILED" }
//
// HMAC CONSTRUCTION (client must replicate this exactly):
//   const body      = JSON.stringify({ jti, reason });
//   const timestamp = Date.now().toString();
//   const message   = `${timestamp}.${body}`;
//   const signature = crypto.createHmac('sha256', secretKey)
//                           .update(message)
//                           .digest('hex');
//   headers: { 'x-signature': `sha256=${signature}`, 'x-timestamp': timestamp }

export async function releaseTicket(req: Request, res: Response): Promise<void>{
    
}