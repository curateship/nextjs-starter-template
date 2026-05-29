import { NextResponse, type NextRequest } from 'next/server'
import { getSessionCookie } from 'better-auth/cookies'
import { getHubPlatformOrigin, isHubPlatformHost } from '@/lib/utils/platform-host'

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname
  const sessionCookie = getSessionCookie(request)
  const host = request.headers.get('host')
  const isAdminPath = path === '/admin' || path.startsWith('/admin/')

  // Keep platform admin surfaces on the canonical Hub host.
  if (isAdminPath) {
    if (!isHubPlatformHost(host)) {
      const redirectUrl = new URL(`${request.nextUrl.pathname}${request.nextUrl.search}`, getHubPlatformOrigin())
      return NextResponse.redirect(redirectUrl)
    }

    if (!sessionCookie) {
      const redirectUrl = new URL('/login', request.url)
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
