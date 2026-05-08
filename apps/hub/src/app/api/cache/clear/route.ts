import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { headers } from 'next/headers'
import { auth } from '@/lib/actions/auth/server'
import { purgeProxyCache } from '@/lib/utils/cache-purge'

export async function POST() {
  try {
    const session = await auth.api.getSession({ headers: await headers() })

    if (!session?.user) {
      return NextResponse.json({
        success: false,
        error: 'Unauthorized - authentication required'
      }, { status: 401 })
    }

    const role = (session.user as { role?: string }).role
    if (role !== 'super_admin') {
      return NextResponse.json({
        success: false,
        error: 'Forbidden - super_admin role required'
      }, { status: 403 })
    }

    revalidateTag('all')
    await purgeProxyCache()
    return NextResponse.json({ success: true, cleared: ['all'] })
  } catch (error) {
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 })
  }
}
