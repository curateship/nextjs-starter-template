import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'

export async function POST() {
  try {
    // Invalidate the global 'all' tag so any cache that includes it is cleared
    revalidateTag('all')
    return NextResponse.json({ success: true, cleared: ['all'] })
  } catch (error) {
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 })
  }
}

