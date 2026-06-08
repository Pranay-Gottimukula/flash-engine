import { Request, Response } from 'express';
import bcrypt                from 'bcryptjs';
import crypto                from 'crypto';
import prisma                from '../lib/prisma';
import { signAuthToken, verifyAuthToken } from '../lib/auth';

function clientView(client: {
  id: string; email: string; name: string | null;
  role: string; publicKey: string; createdAt: Date;
}) {
  return {
    id:        client.id,
    email:     client.email,
    name:      client.name,
    role:      client.role,
    publicKey: client.publicKey,
    createdAt: client.createdAt,
  };
}

// ── POST /api/auth/signup ─────────────────────────────────────────────────────

export async function signup(req: Request, res: Response): Promise<void> {
  const { email, password, name } = req.body as {
    email?: string; password?: string; name?: string;
  };

  if (!email || !password) {
    res.status(400).json({ error: 'email and password are required' });
    return;
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: 'Invalid email address' });
    return;
  }

  if (password.length < 8) {
    res.status(400).json({ error: 'Password must be at least 8 characters' });
    return;
  }

  const existing = await prisma.appClient.findUnique({ where: { email } });
  if (existing) {
    res.status(409).json({ error: 'Email already registered' });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const publicKey    = crypto.randomUUID();

  const client = await prisma.appClient.create({
    data: { email, passwordHash, publicKey, role: 'CLIENT', name: name ?? null },
    select: { id: true, email: true, name: true, role: true, publicKey: true, createdAt: true },
  });

  const token = signAuthToken({ sub: client.id, email: client.email, role: client.role });

  res.status(201).json({ token, client: clientView(client) });
}

// ── POST /api/auth/login ──────────────────────────────────────────────────────

export async function login(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body as { email?: string; password?: string };

  if (!email || !password) {
    res.status(400).json({ error: 'email and password are required' });
    return;
  }

  const client = await prisma.appClient.findUnique({
    where:  { email },
    select: { id: true, email: true, name: true, role: true, publicKey: true,
              createdAt: true, passwordHash: true, suspended: true },
  });

  // Constant-time dummy compare prevents timing-based email enumeration.
  const dummyHash    = '$2a$12$invalidhashfortimingnormalization000000000000000000000000';
  const hashToVerify = client?.passwordHash ?? dummyHash;
  const valid        = await bcrypt.compare(password, hashToVerify);

  if (!client || !valid) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  if (client.suspended) {
    res.status(403).json({ error: 'Account suspended' });
    return;
  }

  const token = signAuthToken({ sub: client.id, email: client.email, role: client.role });

  res.status(200).json({ token, client: clientView(client) });
}

// ── GET /api/auth/me ──────────────────────────────────────────────────────────

export async function getMe(req: Request, res: Response): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' });
    return;
  }

  const token = authHeader.slice(7);

  let payload: any; // Use any or a looser type here since we validate it below
  try {
    payload = verifyAuthToken(token);
  } catch {
    res.status(401).json({ error: 'Token invalid or expired' });
    return;
  }

  // ADD THIS GUARD CLAUSE
  if (!payload || typeof payload.sub !== 'string') {
    res.status(401).json({ error: 'Invalid token payload: missing subject identifier' });
    return;
  }

  const client = await prisma.appClient.findUnique({
    where:  { id: payload.sub },
    select: { id: true, email: true, name: true, role: true,
              publicKey: true, createdAt: true, suspended: true },
  });

  if (!client || client.suspended) {
    res.status(401).json({ error: 'Account not found or suspended' });
    return;
  }

  res.status(200).json({ client: clientView(client) });
}
