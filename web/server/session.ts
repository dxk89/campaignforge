/**
 * Session primitives: hashing, token signing, the admin credential check.
 *
 * Pure functions with no store and no request context, so they can be tested
 * directly and reused by the login route, the accounts store and the admin
 * panel without any of them depending on each other.
 *
 * scrypt rather than a hashing dependency: Node ships it, and one fewer
 * package in a deployment that already carries the agent runtime is worth
 * more than the ergonomics of bcrypt.
 */
import { createHash, randomBytes, scrypt, timingSafeEqual } from 'crypto';
import { promisify } from 'util';
import { SignJWT, jwtVerify } from 'jose';

const scryptAsync = promisify(scrypt);
const KEYLEN = 64;

export type Session = {
  kind: 'owner' | 'account';
  workspaceId: string;
  username: string;
};

function secret(): Uint8Array {
  const raw = process.env.SESSION_SECRET;
  if (!raw || raw.length < 32) {
    throw new Error('SESSION_SECRET must be set to at least 32 characters. See docs/DEPLOY.md.');
  }
  return new TextEncoder().encode(raw);
}

export async function hashPassword(password: string): Promise<{ salt: string; hash: string }> {
  const salt = randomBytes(16).toString('hex');
  const buf = (await scryptAsync(password, salt, KEYLEN)) as Buffer;
  return { salt, hash: buf.toString('hex') };
}

export async function verifyPassword(password: string, salt: string, hash: string): Promise<boolean> {
  const buf = (await scryptAsync(password, salt, KEYLEN)) as Buffer;
  const expected = Buffer.from(hash, 'hex');
  // Lengths must match before timingSafeEqual, which throws otherwise.
  if (expected.length !== buf.length) return false;
  return timingSafeEqual(buf, expected);
}

/** Constant-time compare that tolerates differing lengths. */
function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

/** The owner's credentials live in the environment, not the store. */
export function checkAdmin(username: string, password: string): boolean {
  const u = process.env.ADMIN_USERNAME;
  const p = process.env.ADMIN_PASSWORD;
  if (!u || !p) return false;
  return safeEqual(username, u) && safeEqual(password, p);
}

export const adminConfigured = () => Boolean(process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD);

export async function signSession(s: Session): Promise<string> {
  return new SignJWT({ ...s })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(secret());
}

export async function verifySession(token: string): Promise<Session | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    const { kind, workspaceId, username } = payload as Record<string, unknown>;
    if (kind !== 'owner' && kind !== 'account') return null;
    if (typeof workspaceId !== 'string' || typeof username !== 'string') return null;
    return { kind, workspaceId, username };
  } catch {
    return null;
  }
}

/** Shown to the owner exactly once when an account is created. */
export function generatePassword(): string {
  // Base32-ish, no ambiguous characters, readable over a call.
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = randomBytes(20);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

export function newWorkspaceId(): string {
  return `ws_${randomBytes(8).toString('hex')}`;
}
