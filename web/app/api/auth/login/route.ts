/**
 * Sign in and sign out.
 *
 * POST checks the two passwords from the environment, throttled by IP before
 * either check runs so a locked-out attacker cannot keep guessing. DELETE and PUT both
 * clear the session cookie; PUT additionally redirects, for callers that
 * cannot run client-side JavaScript to read a JSON response.
 */
import { NextResponse } from 'next/server';
import { checkPassword, signSession } from '@/server/session';
import { isLocked, recordFailure, clearFailures } from '@/server/throttle';
import { SESSION_COOKIE } from '@/server/auth';

export const runtime = 'nodejs';
const SEVEN_DAYS = 60 * 60 * 24 * 7;

/**
 * The client address, for throttling only.
 *
 * x-forwarded-for is a client-supplied list that a proxy appends to, so its
 * FIRST entry is whatever the caller chose to send: reading it would let an
 * attacker rotate the header and get a fresh throttle bucket per request.
 * Vercel sets x-vercel-forwarded-for and x-real-ip itself and overwrites any
 * client value, so prefer those; fall back to the LAST x-forwarded-for entry,
 * which is the one appended by the nearest trusted hop.
 */
function clientIp(req: Request): string {
  const vercel = req.headers.get('x-vercel-forwarded-for');
  if (vercel) return vercel.split(',').pop()!.trim();
  const real = req.headers.get('x-real-ip');
  if (real) return real.trim();
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) {
    const last = fwd.split(',').pop()!.trim();
    if (last) return last;
  }
  return 'unknown';
}

export async function POST(req: Request) {
  const ip = clientIp(req);
  if (await isLocked(ip)) {
    return NextResponse.json({ error: 'Too many attempts. Try again in fifteen minutes.' }, { status: 429 });
  }
  const { password } = await req.json().catch(() => ({}));
  if (!password) {
    return NextResponse.json({ error: 'A password is required' }, { status: 400 });
  }

  const role = checkPassword(password);
  if (!role) {
    await recordFailure(ip);
    return NextResponse.json({ error: 'That password was not recognised' }, { status: 401 });
  }

  await clearFailures(ip);
  const res = NextResponse.json({ ok: true, admin: role === 'admin' });
  res.cookies.set(SESSION_COOKIE, await signSession({ workspaceId: 'owner', admin: role === 'admin' }), {
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
