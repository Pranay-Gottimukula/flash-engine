// apps/engine-gateway/src/routes/jwks.routes.ts
//
// Serves RSA public keys in JWKS format.
// Clients fetch this once at startup to get the public key for JWT verification.
// They can also cache it — public keys never change for an event's lifetime.

import { Router, Request, Response } from 'express';
import { createPublicKey }           from 'crypto';
import prisma                        from '../lib/prisma';

const router = Router();

// GET /api/.well-known/jwks/:eventPublicKey

router.get('/:eventPublicKey', async (req: Request, res: Response) => {
  const eventPublicKey = req.params.eventPublicKey as string;

  const event = await prisma.saleEvent.findUnique({
    where:  { publicKey: eventPublicKey },
    select: { rsaPublicKey: true },
  });

  if (!event) {
    res.status(404).json({ error: 'Event not found' });
    return;
  }

  // Convert PEM → JWK — standard format all JWT libraries understand
  const keyObject = createPublicKey(event.rsaPublicKey);
  const jwk       = keyObject.export({ format: 'jwk' });

  // Clients cache this for 1 hour — safe since keys never rotate mid-event
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.status(200).json({
    keys: [{
      ...jwk,
      use: 'sig',               // key purpose: signature verification
      alg: 'RS256',
      kid: eventPublicKey,      // key ID — lets clients match token to key
    }],
  });
});

export default router;