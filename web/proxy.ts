/**
 * Proxy (formerly middleware). Everything except /login, /api/auth and static assets requires a session
 * cookie. The cookie's validity is checked in the route handlers and server
 * components (the proxy runs on the edge and cannot use firebase-admin);
 * this is the cheap gate that keeps unauthenticated requests off the pages.
 */
import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC = ['/login', '/api/auth', '/api/health'];

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
