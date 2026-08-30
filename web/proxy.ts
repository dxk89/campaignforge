/**
 * Proxy (formerly middleware). Everything except /login, /api/auth/login and
 * static assets requires a session cookie. The cookie's validity is checked
 * in the route handlers and server components (the proxy runs on the edge
 * and cannot use firebase-admin); this is the cheap gate that keeps
 * unauthenticated requests off the pages.
 */
import { NextResponse, type NextRequest } from 'next/server';

// /robots.txt is public because a crawler cannot obey a rule it is redirected
// away from. Everything behind it needs a session anyway, so this only makes
// the refusal legible rather than opening anything.
const PUBLIC = ['/login', '/api/auth/login', '/api/health', '/robots.txt'];

export default function proxy(req: NextRequest) {
  if (process.env.MOCK_AUTH === '1') return NextResponse.next();
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => pathname.startsWith(p))) return NextResponse.next();
  if (req.cookies.get('cf_session')) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.searchParams.set('next', pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.css$|.*\\.js$).*)'],
};
