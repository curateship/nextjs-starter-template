import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'


export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request,
  })

  // Create admin client for site lookups (with service role key)
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  )

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

  // Extract subdomain and custom domain info
  const host = request.headers.get('host') || 'localhost:3000'
  const hostname = host.split(':')[0] // Remove port for subdomain extraction
  
  // Check if this is a custom domain (not localhost and not a subdomain of our main domain)
  const isLocalhost = hostname === 'localhost'
  const isCustomDomain = !isLocalhost && !hostname.includes('.localhost') && !hostname.includes('.yourdomain.com')
  
  // Skip database queries entirely for localhost development
  if (isLocalhost) {
    // For localhost, add default site headers without database lookup
    const requestHeaders = new Headers(request.headers)
    requestHeaders.set('x-site-id', process.env.HUB_SITE_ID || 'localhost-default')
    requestHeaders.set('x-site-subdomain', 'localhost')
    requestHeaders.set('x-site-domain', '')

    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    })
  }
  
  let siteIdentifier = ''
  
  if (isCustomDomain) {
    // Custom domain - look up by domain
    siteIdentifier = host
  } else {
    // Subdomain - extract subdomain
    const parts = hostname.split('.')
    if (parts.length > 1) { // Allow .localhost subdomains
      siteIdentifier = parts[0] // First part is the subdomain
    }
  }

  // Validate and sanitize site identifier before database lookup
  if (siteIdentifier) {
    // Input validation: only allow safe characters for domain/subdomain
    const safeDomainRegex = /^[a-zA-Z0-9.-]+(?::[0-9]{1,5})?$/
    if (!safeDomainRegex.test(siteIdentifier)) {
      console.warn('Invalid site identifier format:', siteIdentifier)
      return NextResponse.rewrite(new URL('/404', request.url))
    }
    
    // Length validation to prevent DoS
    if (siteIdentifier.length > 255) {
      console.warn('Site identifier too long:', siteIdentifier.length)
      return NextResponse.rewrite(new URL('/404', request.url))
    }
    try {
      // Query the database for site info using the admin client
      // Run both queries in parallel for better performance
      const [subdomainResult, domainResult] = await Promise.all([
        supabaseAdmin
          .from('sites')
          .select('id, subdomain, custom_domain, status')
          .eq('subdomain', siteIdentifier)
          .maybeSingle(),
        supabaseAdmin
          .from('sites')
          .select('id, subdomain, custom_domain, status')
          .eq('custom_domain', siteIdentifier)
          .maybeSingle()
      ])
      
      // Use whichever query found a result
      const site = subdomainResult.data || domainResult.data
      const error = subdomainResult.error || domainResult.error

      if (error) {
        console.error('Middleware - Error looking up site:', error)
      }

      if (site && (site.status === 'active' || site.status === 'draft')) {
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
        // Site not found or not active - show 404
        return NextResponse.rewrite(new URL('/404', request.url))
      }
    } catch (error) {
      console.error('Error looking up site:', error)
      // Continue with normal routing on database errors
    }
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