import { NextResponse, type NextRequest } from 'next/server'
import { getSessionCookie } from 'better-auth/cookies'

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname
  const sessionCookie = getSessionCookie(request)

  // Protect /admin routes - require authentication (role check done in layout)
  if (path.startsWith('/admin')) {
    if (!sessionCookie) {
      return NextResponse.redirect(new URL('/', request.url))
    }
  }

  // Protect /user-pages and /user-dashboard routes - require authentication
  if (path.startsWith('/user-pages') || path.startsWith('/user-dashboard')) {
    if (!sessionCookie) {
      return NextResponse.redirect(new URL('/', request.url))
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/admin/:path*',
    '/user-pages/:path*',
    '/user-dashboard/:path*',
  ],
}
