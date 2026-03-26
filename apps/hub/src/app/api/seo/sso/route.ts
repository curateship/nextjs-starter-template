import { NextResponse, type NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { buildSeoLaunchUrl, createSeoSsoClaims, createSeoSsoToken } from '@/lib/seo/sso'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers })

  if (!session?.user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  const claims = createSeoSsoClaims({
    id: session.user.id,
    email: session.user.email,
    role: (session.user as { role?: string | null }).role,
  })

  if (!claims.seo_access) {
    return NextResponse.json({ error: 'SEO access not enabled for this user' }, { status: 403 })
  }

  const token = createSeoSsoToken(claims)

  return NextResponse.json({
    token,
    claims,
    launchUrl: buildSeoLaunchUrl(token),
  })
}
