import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const url = request.nextUrl.clone();
  const host = request.headers.get('host') || '';
  let pathname = url.pathname;

  // If they access resgatar.supersoftware.info/ at root, rewrite internally to /resgatar
  if (host === 'resgatar.supersoftware.info') {
    if (url.pathname === '/') {
      url.pathname = '/resgatar';
      pathname = '/resgatar';
    }
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-pathname', pathname);

  if (host === 'resgatar.supersoftware.info' && url.pathname === '/resgatar') {
    return NextResponse.rewrite(url, {
      request: {
        headers: requestHeaders,
      }
    });
  }

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    }
  });
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
