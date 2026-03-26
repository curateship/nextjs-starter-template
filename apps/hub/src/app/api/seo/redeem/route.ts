import { and, eq, gt, isNull } from 'drizzle-orm'
import { NextResponse, type NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { seoLaunchCodes } from '@/lib/db/schema'
import { getSeoServiceTokenHeader, isValidSeoServiceToken } from '@/lib/seo/sso'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const serviceToken = request.headers.get(getSeoServiceTokenHeader())

  if (!isValidSeoServiceToken(serviceToken)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await request.json().catch(() => null)) as { code?: string } | null
  const code = body?.code?.trim()

  if (!code) {
    return NextResponse.json({ error: 'code is required' }, { status: 400 })
  }

  const [launch] = await db
    .update(seoLaunchCodes)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(seoLaunchCodes.code, code),
        isNull(seoLaunchCodes.usedAt),
        gt(seoLaunchCodes.expiresAt, new Date())
      )
    )
    .returning()

  if (!launch) {
    return NextResponse.json({ error: 'Launch code invalid or expired' }, { status: 401 })
  }

  if (!launch.seoAccess) {
    return NextResponse.json({ error: 'SEO access disabled' }, { status: 403 })
  }

  return NextResponse.json({
    access: {
      hub_user_id: launch.hubUserId,
      email: launch.email,
      role: launch.role,
      seo_access: launch.seoAccess,
    },
  })
}
