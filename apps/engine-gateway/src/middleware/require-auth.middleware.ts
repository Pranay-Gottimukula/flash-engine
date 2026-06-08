import { Request, Response, NextFunction } from 'express';
import prisma                              from '../lib/prisma';
import { verifyAuthToken }                 from '../lib/auth';

export async function requireAuth(
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

  const client = await prisma.appClient.findUnique({
    where:  { id: sub },
    select: { id: true, email: true, name: true, role: true, publicKey: true, suspended: true },
  });

  if (!client || client.suspended) {
    res.status(401).json({ error: 'Unauthorized' });
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

// Must be placed after requireAuth in the middleware chain.
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const role = res.locals.client?.role;
    if (!role || !roles.includes(role)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }
    next();
  };
}
