/**
 * Sign in and sign out.
 *
 * POST checks the owner's env-configured credentials first, then falls back
 * to demo accounts in the store, and is throttled by IP before either check
 * runs so a locked-out attacker cannot keep guessing. DELETE and PUT both
 * clear the session cookie; PUT additionally redirects, for callers that
 * cannot run client-side JavaScript to read a JSON response.
 */
import { NextResponse } from 'next/server';
import { checkAdmin, signSession } from '@/server/session';
import { authenticate } from '@/server/accounts';
import { isLocked, recordFailure, clearFailures } from '@/server/throttle';
import { SESSION_COOKIE } from '@/server/auth';

export const runtime = 'nodejs';
const SEVEN_DAYS = 60 * 60 * 24 * 7;

function clientIp(req: Request): string {
  return (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
}

export async function POST(req: Request) {
  const ip = clientIp(req);
  if (await isLocked(ip)) {
    return NextResponse.json({ error: 'Too many attempts. Try again in fifteen minutes.' }, { status: 429 });
  }
  const { username, password } = await req.json().catch(() => ({}));
  if (!username || !password) {
    return NextResponse.json({ error: 'Username and password are required' }, { status: 400 });
  }

  const session = checkAdmin(username, password)
    ? { kind: 'owner' as const, workspaceId: 'owner', username }
    : await authenticate(username, password);

  if (!session) {
    await recordFailure(ip);
    return NextResponse.json({ error: 'Those details were not recognised' }, { status: 401 });
  }

  await clearFailures(ip);
  const res = NextResponse.json({ ok: true, kind: session.kind, username: session.username });
  res.cookies.set(SESSION_COOKIE, await signSession(session), {
    httpOnly: true, secure: true, sameSite: 'lax', maxAge: SEVEN_DAYS, path: '/',
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}

/** Sign out from a plain form post, so the header needs no client component. */
export async function PUT(req: Request) {
  const url = new URL(req.url);
  const res = NextResponse.redirect(new URL('/login', url.origin), 303);
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
