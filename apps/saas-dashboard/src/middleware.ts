import { type NextRequest, NextResponse } from 'next/server';

// Must match AUTH_TOKEN_COOKIE in api.ts — kept inline so middleware
// stays Edge-compatible without importing browser-only modules.
const TOKEN_COOKIE = 'flash_token';

export function middleware(req: NextRequest) {
  const token       = req.cookies.get(TOKEN_COOKIE)?.value;
  const { pathname } = req.nextUrl;

  if ((pathname.startsWith('/dashboard') || pathname.startsWith('/admin')) && !token) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  if ((pathname === '/login' || pathname === '/signup') && token) {
    return NextResponse.redirect(new URL('/dashboard', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/admin/:path*', '/login', '/signup'],
};
