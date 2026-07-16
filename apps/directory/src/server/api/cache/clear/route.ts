import { NextResponse } from '@/lib/web-response'
import { revalidateTag } from '@/lib/cache'
import { headers } from '@/lib/request-headers'
import { auth } from '@/lib/actions/auth/server'
import { purgeProxyCache } from '@/lib/utils/cache-purge'
import { isSameOriginRequest } from '@/lib/utils/request-origin'

export async function POST(request: Request) {
  try {
    if (!isSameOriginRequest(request)) {
      return NextResponse.json({ success: false, error: 'Invalid origin' }, { status: 403 })
    }

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
