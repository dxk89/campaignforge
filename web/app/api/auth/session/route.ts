import { NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { getApps } from 'firebase-admin/app';
import { verifyIdToken, SESSION_COOKIE } from '@/server/auth';
import { storeEnabled } from '@/server/firebase';

export const runtime = 'nodejs';

const FIVE_DAYS = 60 * 60 * 24 * 5 * 1000;

export async function POST(req: Request) {
  try {
    const { idToken } = await req.json();
    if (!idToken) return NextResponse.json({ error: 'idToken is required' }, { status: 400 });
    const session = await verifyIdToken(idToken);
    const res = NextResponse.json({ ok: true, email: session.email });
    if (storeEnabled && process.env.MOCK_AUTH !== '1') {
      const cookie = await getAuth(getApps()[0]).createSessionCookie(idToken, { expiresIn: FIVE_DAYS });
      res.cookies.set(SESSION_COOKIE, cookie, { httpOnly: true, secure: true, sameSite: 'lax', maxAge: FIVE_DAYS / 1000, path: '/' });
    }
    return res;
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Sign-in failed' }, { status: err.status || 401 });
  }
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
