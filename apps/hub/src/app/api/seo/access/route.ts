import { NextResponse, type NextRequest } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { authUsers } from '@/lib/db/schema'
import { getSeoAccessSnapshot } from '@/lib/seo/access'
import { getSeoServiceTokenHeader, isValidSeoServiceToken } from '@/lib/seo/sso'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const serviceToken = request.headers.get(getSeoServiceTokenHeader())

  if (!isValidSeoServiceToken(serviceToken)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await request.json().catch(() => null)) as { hub_user_id?: string } | null
  const hubUserId = body?.hub_user_id?.trim()

  if (!hubUserId) {
    return NextResponse.json({ error: 'hub_user_id is required' }, { status: 400 })
  }

  const user = await db.query.authUsers.findFirst({
    where: eq(authUsers.id, hubUserId),
  })

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  return NextResponse.json({
    access: getSeoAccessSnapshot({
      id: user.id,
      email: user.email,
      role: user.role,
    }),
  })
}
