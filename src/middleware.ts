import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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

  // Check if this is a custom domain
  try {
    const { data: site, error } = await supabaseAdmin
      .from('sites')
      .select('id, subdomain, custom_domain, status')
      .eq('custom_domain', hostname)
      .eq('status', 'active')
      .single()

    if (site && !error) {
      // Custom domain found - rewrite the request
      // This makes the app think it's being accessed via subdomain
      const rewriteUrl = new URL(url)
      
      // Add custom headers to identify the site
      const response = NextResponse.rewrite(rewriteUrl)
      response.headers.set('x-custom-domain', hostname)
      response.headers.set('x-site-id', site.id)
      response.headers.set('x-site-subdomain', site.subdomain)
      
      return response
    }

    // If not a custom domain, check if it's a subdomain
    if (hostname.includes('.')) {
      const subdomain = hostname.split('.')[0]
      
      // Skip if it's a known system subdomain
      if (['www', 'api', 'admin', 'app'].includes(subdomain)) {
        return NextResponse.next()
      }

      // Check if subdomain exists
      const { data: subdomainSite } = await supabaseAdmin
        .from('sites')
        .select('id, subdomain, status')
        .eq('subdomain', subdomain)
        .eq('status', 'active')
        .single()

      if (subdomainSite) {
        // Subdomain found - add headers
        const response = NextResponse.next()
        response.headers.set('x-site-id', subdomainSite.id)
        response.headers.set('x-site-subdomain', subdomainSite.subdomain)
        
        return response
      }
    }

  } catch (error) {
    // If database query fails, let the request continue
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
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
}