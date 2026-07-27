import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from './db.js';

if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET env var is required');
const JWT_SECRET: string = process.env.JWT_SECRET;

const COOKIE_NAME = 'rikari_token';
const TOKEN_TTL = '30d';

export type Role = 'owner' | 'viewer';

export interface AuthedRequest extends Request {
  userId?: string;
  businessId?: string;
  role?: Role;
}

export function signToken(userId: string): string {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

export function setAuthCookie(res: Response, token: string) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

export function clearAuthCookie(res: Response) {
  res.clearCookie(COOKIE_NAME, { path: '/' });
}

/** Resolves req.userId, req.businessId and req.role from the session cookie.
 *  Looked up fresh on every request (not baked into the JWT) so a role
 *  change or removal from the team takes effect immediately. */
export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return res.status(401).json({ error: 'not_authenticated' });
  let userId: string;
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { sub: string };
    userId = payload.sub;
  } catch {
    return res.status(401).json({ error: 'invalid_token' });
  }
  const membership = await prisma.membership.findFirst({ where: { userId } });
  if (!membership) return res.status(401).json({ error: 'no_business' });
  req.userId = userId;
  req.businessId = membership.businessId;
  req.role = membership.role as Role;
  next();
}

/** Blocks viewers from mutating routes — mount after requireAuth. */
export function requireOwner(req: AuthedRequest, res: Response, next: NextFunction) {
  if (req.role !== 'owner') return res.status(403).json({ error: 'Somente o dono da conta pode fazer isso' });
  next();
}

/** Same as requireOwner, but lets GET/HEAD through for anyone on the team —
 *  mount once per router so every write route is guarded without having to
 *  annotate each handler individually. */
export function requireOwnerForWrites(req: AuthedRequest, res: Response, next: NextFunction) {
  if (req.method === 'GET' || req.method === 'HEAD') return next();
  return requireOwner(req, res, next);
}
