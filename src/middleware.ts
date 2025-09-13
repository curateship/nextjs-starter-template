import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { resolveSiteByHost } from '@/lib/actions/pages/page-frontend-actions'

// Create Supabase client for middleware
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function middleware(request: NextRequest) {
  const url = request.nextUrl
  const hostname = request.headers.get('host') || ''

  // Skip middleware for specific paths
  if (
    url.pathname.startsWith('/_next/') ||      // Next.js internals
    url.pathname.startsWith('/api/') ||        // API routes
    url.pathname.startsWith('/admin/') ||      // Admin panel
    url.pathname.includes('.') ||              // Static files (images, css, js)
    hostname.includes('vercel.app') ||         // Vercel preview URLs
    hostname.includes('localhost')             // Local development
  ) {
    return NextResponse.next()
  }

  // Resolve site via cached action
  try {
    const resolved = await resolveSiteByHost(hostname)
    if (resolved) {
      if (resolved.custom_domain) {
        // Custom domain: rewrite so app treats it like subdomain routing
        const rewriteUrl = new URL(url)
        const response = NextResponse.rewrite(rewriteUrl)
        response.headers.set('x-custom-domain', hostname)
        response.headers.set('x-site-id', resolved.id)
        response.headers.set('x-site-subdomain', resolved.subdomain)
        return response
      }
      // Subdomain: just continue the request and attach headers (no rewrite)
      const response = NextResponse.next()
      response.headers.set('x-site-id', resolved.id)
      response.headers.set('x-site-subdomain', resolved.subdomain)
      return response
    }
  } catch (_) {
    // If resolution fails, continue
  }

  // Default: let the request continue normally
  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     */
    '/((?!api|_next/static|_next/image).*)',
  ],
}