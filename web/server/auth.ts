/**
 * Single-user auth.
 *
 * One operator. A Firebase ID token is verified server-side and its email
 * checked against ALLOWED_EMAIL. No roles, no sharing, no session store.
 * Data is rooted at users/{uid} so adding a second user later is a rules
 * change rather than a migration.
 *
 * MOCK_AUTH=1 bypasses verification for tests and local mock runs.
 */
import { cookies } from 'next/headers';
import { getAuth } from 'firebase-admin/auth';
import { storeEnabled } from './firebase';

export const SESSION_COOKIE = 'cf_session';
const MOCK_AUTH = process.env.MOCK_AUTH === '1';

export type Session = { email: string; uid: string };

export async function verifyIdToken(idToken: string): Promise<Session> {
  if (MOCK_AUTH) return { email: process.env.ALLOWED_EMAIL || 'mock@local', uid: 'owner' };
  if (!storeEnabled) throw Object.assign(new Error('Auth is not configured on this deployment'), { status: 503 });
  const { getApps } = await import('firebase-admin/app');
  const decoded = await getAuth(getApps()[0]).verifyIdToken(idToken);
  const allowed = process.env.ALLOWED_EMAIL;
  if (!allowed) throw Object.assign(new Error('ALLOWED_EMAIL is not set'), { status: 503 });
  if ((decoded.email || '').toLowerCase() !== allowed.toLowerCase()) {
    throw Object.assign(new Error('This account is not permitted'), { status: 403 });
  }
  if (!decoded.email_verified) throw Object.assign(new Error('Email is not verified'), { status: 403 });
  return { email: decoded.email!, uid: decoded.uid };
}

/** Read the session from the cookie. Returns null when signed out. */
export async function currentSession(): Promise<Session | null> {
  if (MOCK_AUTH) return { email: process.env.ALLOWED_EMAIL || 'mock@local', uid: 'owner' };
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { getApps } = await import('firebase-admin/app');
    const decoded = await getAuth(getApps()[0]).verifySessionCookie(token, true);
    if ((decoded.email || '').toLowerCase() !== (process.env.ALLOWED_EMAIL || '').toLowerCase()) return null;
    return { email: decoded.email!, uid: decoded.uid };
  } catch {
    return null;
  }
}

/** For route handlers: throw a 401 unless signed in. */
export async function requireSession(): Promise<Session> {
  const s = await currentSession();
  if (!s) throw Object.assign(new Error('Sign in required'), { status: 401 });
  return s;
}
