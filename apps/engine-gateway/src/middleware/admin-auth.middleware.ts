import { Request, Response, NextFunction } from 'express';
import prisma                              from '../lib/prisma';
import { verifyAuthToken }                 from '../lib/auth';

// ── requireAdminAuth ──────────────────────────────────────────────────────────
//
// Verifies a Bearer JWT and attaches the decoded client to res.locals.client.
// Accepts CLIENT and SUPER_ADMIN roles — routes that require SUPER_ADMIN must
// chain requireRole('SUPER_ADMIN') after this middleware.

export async function requireAdminAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' });
    return;
  }

  const token = authHeader.slice(7);

  let sub: string;
  try {
    ({ sub } = verifyAuthToken(token));
  } catch {
    res.status(401).json({ error: 'Token invalid or expired' });
    return;
  }

  const client = await prisma.client.findUnique({
    where:  { id: sub },
    select: { id: true, email: true, name: true, role: true, publicKey: true, suspended: true },
  });

  if (!client || client.suspended) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  if (client.role !== 'CLIENT' && client.role !== 'SUPER_ADMIN') {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }

  res.locals.client = {
    id:        client.id,
    email:     client.email,
    name:      client.name,
    role:      client.role,
    publicKey: client.publicKey,
  };

  next();
}

// ── requireRole ───────────────────────────────────────────────────────────────
//
// Must run after requireAdminAuth. Checks res.locals.client.role.

export function requireRole(role: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const client = res.locals.client;
    if (!client || client.role !== role) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }
    next();
  };
}
