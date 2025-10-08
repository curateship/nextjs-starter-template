import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function middleware(request: NextRequest) {
  const url = request.nextUrl

  if (
    url.pathname.startsWith('/_next/') ||
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/admin/') ||
    url.pathname.includes('.') ||
    url.pathname.startsWith('/maintenance')
  ) {
    return NextResponse.next()
  }

  try {
    const { data: sites } = await supabaseAdmin
      .from('sites')
      .select('id, settings')
      .eq('settings->maintenance->enabled', true)

    if (sites && sites.length > 0) {
      return NextResponse.redirect(new URL('/maintenance', url))
    }
  } catch (error) {
    // Continue if error
  }

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