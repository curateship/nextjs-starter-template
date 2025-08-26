import { NextResponse, type NextRequest } from 'next/server'
import { getSiteMapping } from '@/lib/utils/site-mappings'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request,
  })

  // Skip site lookup for static files, API routes, admin routes, and other Next.js internals
  if (
    request.nextUrl.pathname.startsWith('/_next/') ||
    request.nextUrl.pathname.startsWith('/api/') ||
    request.nextUrl.pathname.startsWith('/favicon.ico') ||
    request.nextUrl.pathname.startsWith('/manifest.json') ||
    request.nextUrl.pathname.startsWith('/robots.txt') ||
    request.nextUrl.pathname.startsWith('/sitemap.xml') ||
    request.nextUrl.pathname.startsWith('/login') ||
    request.nextUrl.pathname.startsWith('/signup') ||
    request.nextUrl.pathname.startsWith('/themes/') ||
    request.nextUrl.pathname.startsWith('/admin')  // Skip site lookup for admin routes
  ) {
    return response
  }

  // Extract host from headers
  const host = request.headers.get('host') || 'localhost:3000'
  
  // Use site mappings for fast lookup (no database query)
  const site = getSiteMapping(host)
  
  if (site) {
    // Add site info to request headers for components to access
    const requestHeaders = new Headers(request.headers)
    requestHeaders.set('x-site-id', site.id)
    requestHeaders.set('x-site-subdomain', site.subdomain)
    requestHeaders.set('x-site-domain', site.custom_domain || '')

    response = NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    })
  } else {
    // Site not found in mappings - show 404
    return NextResponse.rewrite(new URL('/404', request.url))
  }

  return response
}

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
}