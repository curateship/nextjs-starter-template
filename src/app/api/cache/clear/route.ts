import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { purgeProxyCache } from '@/lib/utils/cache-purge'

export async function POST() {
  try {
    // Verify user is authenticated and has super_admin role
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({
        success: false,
        error: 'Unauthorized - authentication required'
      }, { status: 401 })
    }

    const role = user.app_metadata?.role
    if (role !== 'super_admin') {
      return NextResponse.json({
        success: false,
        error: 'Forbidden - super_admin role required'
      }, { status: 403 })
    }

    // Invalidate the global 'all' tag so any cache that includes it is cleared
    revalidateTag('all')
    await purgeProxyCache()
    return NextResponse.json({ success: true, cleared: ['all'] })
  } catch (error) {
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 })
  }
}

