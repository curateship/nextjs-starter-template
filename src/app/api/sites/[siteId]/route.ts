import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { sites } from '@/lib/db/schema'
import { auth } from '@/lib/auth'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> }
) {
  try {
    const { siteId } = await params

    // Validate site ID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(siteId)) {
      return NextResponse.json(
        { data: null, error: 'Invalid site ID format' },
        { status: 400 }
      )
    }

    // Get the authenticated user's ID from the session
    const session = await auth.api.getSession({ headers: request.headers })
    if (!session?.user) {
      return NextResponse.json(
        { data: null, error: 'User not authenticated' },
        { status: 401 }
      )
    }
    const userId = session.user.id!

    // Get the site
    const site = await db.query.sites.findFirst({
      where: eq(sites.id, siteId),
    })

    if (!site) {
      return NextResponse.json(
        { data: null, error: 'Site not found' },
        { status: 404 }
      )
    }

    // Verify user owns this site
    if (site.userId !== userId) {
      return NextResponse.json(
        { data: null, error: 'Access denied' },
        { status: 403 }
      )
    }

    return NextResponse.json({ data: site, error: null })
  } catch (error) {
    console.error('API Error:', error)
    return NextResponse.json(
      {
        data: null,
        error: `Server error: ${error instanceof Error ? error.message : String(error)}`
      },
      { status: 500 }
    )
  }
}
