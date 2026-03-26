import { NextResponse, type NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { buildSeoLaunchUrl, createSeoSsoClaims, createSeoSsoToken } from '@/lib/seo/sso'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers })

  if (!session?.user) {
    const loginUrl = new URL('/login?redirect=/admin/seo', request.url)
    return NextResponse.redirect(loginUrl)
  }

  const claims = createSeoSsoClaims({
    id: session.user.id,
    email: session.user.email,
    role: (session.user as { role?: string | null }).role,
  })

  if (!claims.seo_access) {
    return NextResponse.redirect(new URL('/admin/seo?error=no-access', request.url))
  }

  return NextResponse.redirect(buildSeoLaunchUrl(createSeoSsoToken(claims)))
}
