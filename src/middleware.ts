import { NextResponse } from 'next/server'

export async function middleware() {
  // Middleware is intentionally minimal to avoid unnecessary database calls
  // Site-specific logic (like maintenance mode) is handled in page components
  // where site data is already being loaded
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