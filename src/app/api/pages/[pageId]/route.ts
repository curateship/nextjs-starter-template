import { NextRequest, NextResponse } from 'next/server'
import { eq, and, ne } from 'drizzle-orm'
import { db } from '@/lib/db'
import { pages, sites } from '@/lib/db/schema'
import { auth } from '@/lib/auth'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ pageId: string }> }
) {
  try {
    const { pageId } = await params

    // Validate page ID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(pageId)) {
      return NextResponse.json(
        { data: null, error: 'Invalid page ID format' },
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

    // Get the page
    const page = await db.query.pages.findFirst({
      where: eq(pages.id, pageId),
    })

    if (!page) {
      return NextResponse.json(
        { data: null, error: 'Page not found' },
        { status: 404 }
      )
    }

    // Verify user owns the site this page belongs to
    const site = await db.query.sites.findFirst({
      where: and(eq(sites.id, page.siteId), eq(sites.userId, userId)),
      columns: { id: true },
    })

    if (!site) {
      return NextResponse.json(
        { data: null, error: 'Site not found or access denied' },
        { status: 403 }
      )
    }

    return NextResponse.json({ data: page, error: null })
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

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ pageId: string }> }
) {
  try {
    const { pageId } = await params
    const updates = await request.json()

    // Validate page ID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(pageId)) {
      return NextResponse.json(
        { data: null, error: 'Invalid page ID format' },
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

    // Get the page first
    const page = await db.query.pages.findFirst({
      where: eq(pages.id, pageId),
    })

    if (!page) {
      return NextResponse.json(
        { data: null, error: 'Page not found' },
        { status: 404 }
      )
    }

    // Verify user owns the site this page belongs to
    const site = await db.query.sites.findFirst({
      where: and(eq(sites.id, page.siteId), eq(sites.userId, userId)),
      columns: { id: true },
    })

    if (!site) {
      return NextResponse.json(
        { data: null, error: 'Site not found or access denied' },
        { status: 403 }
      )
    }

    // Validate title if being updated
    if (updates.title !== undefined && !updates.title?.trim()) {
      return NextResponse.json(
        { data: null, error: 'Page title cannot be empty' },
        { status: 400 }
      )
    }

    // If setting as homepage, unset any existing homepage
    if (updates.is_homepage === true) {
      await db.update(pages)
        .set({ isHomepage: false })
        .where(and(
          eq(pages.siteId, page.siteId),
          eq(pages.isHomepage, true),
          ne(pages.id, pageId)
        ))
    }

    // Build update object with camelCase keys
    const updateValues: Record<string, unknown> = { updatedAt: new Date() }
    if (updates.title !== undefined) updateValues.title = updates.title
    if (updates.slug !== undefined) updateValues.slug = updates.slug
    if (updates.meta_description !== undefined) updateValues.metaDescription = updates.meta_description
    if (updates.meta_keywords !== undefined) updateValues.metaKeywords = updates.meta_keywords
    if (updates.template !== undefined) updateValues.template = updates.template
    if (updates.is_homepage !== undefined) updateValues.isHomepage = updates.is_homepage
    if (updates.is_published !== undefined) updateValues.isPublished = updates.is_published
    if (updates.display_order !== undefined) updateValues.displayOrder = updates.display_order

    // Update the page
    const [updatedPage] = await db.update(pages)
      .set(updateValues)
      .where(eq(pages.id, pageId))
      .returning()

    return NextResponse.json({ data: updatedPage, error: null })
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
