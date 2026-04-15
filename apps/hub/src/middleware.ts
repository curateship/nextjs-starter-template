import { NextResponse, type NextRequest } from 'next/server'
import { getSessionCookie } from 'better-auth/cookies'

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname
  const sessionCookie = getSessionCookie(request)

  // Protect /admin routes - require authentication (role check done in layout)
  if (path.startsWith('/admin')) {
    if (!sessionCookie) {
      const redirectUrl = new URL('/admin-login', request.url)
      const pathWithQuery = `${request.nextUrl.pathname}${request.nextUrl.search}`
      redirectUrl.searchParams.set('redirect', pathWithQuery)
      return NextResponse.redirect(redirectUrl)
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/admin/:path*',
  ],
}
