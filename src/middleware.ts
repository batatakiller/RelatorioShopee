import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const url = request.nextUrl.clone();
  const host = request.headers.get('host') || '';

  // Check if user is accessing via the subdomain resgatar.supersoftware.info
  if (host === 'resgatar.supersoftware.info') {
    // If they access the root '/', redirect them to '/resgatar'
    if (url.pathname === '/') {
      url.pathname = '/resgatar';
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

// Config to run middleware only on page routes
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};
