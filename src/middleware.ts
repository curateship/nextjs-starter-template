import { NextResponse } from 'next/server'

export async function middleware() {
  // Middleware is intentionally minimal to avoid unnecessary database calls
  // Authentication is handled in the /admin layout.tsx server component
  // This provides better error handling and a cleaner user experience
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