import { NextRequest, NextResponse } from 'next/server'
import { eq, and, ne } from 'drizzle-orm'
import { db } from '@/lib/db'
import { siteAccountPages, sites } from '@/lib/db/schema'
import { auth } from '@/lib/auth/server'
import { validateContentBlocks } from '@/lib/utils/content-block-validation'
import { isSameOriginRequest } from '@/lib/utils/request-origin'

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

    // Get the account page
    const page = await db.query.siteAccountPages.findFirst({
      where: eq(siteAccountPages.id, pageId),
    })

    if (!page) {
      return NextResponse.json(
        { data: null, error: 'Account page not found' },
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
        error: 'Server error'
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
    if (!isSameOriginRequest(request)) {
      return NextResponse.json(
        { data: null, error: 'Invalid origin' },
        { status: 403 }
      )
    }

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

    // Get the account page first
    const page = await db.query.siteAccountPages.findFirst({
      where: eq(siteAccountPages.id, pageId),
    })

    if (!page) {
      return NextResponse.json(
        { data: null, error: 'Account page not found' },
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

    if (updates.slug !== undefined) {
      const slug = String(updates.slug).trim()

      if (!/^[a-zA-Z0-9_-]+$/.test(slug)) {
        return NextResponse.json(
          { data: null, error: 'Invalid slug format. Use only letters, numbers, hyphens, and underscores.' },
          { status: 400 }
        )
      }

      const reservedSlugs = ['api', 'admin', 'admin-login', 'maintenance', 'www', 'mail', 'ftp', 'global']
      if (reservedSlugs.includes(slug.toLowerCase())) {
        return NextResponse.json(
          { data: null, error: 'This slug is reserved and cannot be used.' },
          { status: 400 }
        )
      }

      const conflictingAccountPage = await db.query.siteAccountPages.findFirst({
        where: and(eq(siteAccountPages.siteId, page.siteId), eq(siteAccountPages.slug, slug), ne(siteAccountPages.id, pageId)),
        columns: { title: true },
      })

      if (conflictingAccountPage) {
        return NextResponse.json(
          { data: null, error: `This slug is already used by another account page titled "${conflictingAccountPage.title}". Please choose a different slug.` },
          { status: 400 }
        )
      }

      updates.slug = slug
    }

    // If setting as default page, unset any existing default page
    if (updates.is_default === true) {
      await db.update(siteAccountPages)
        .set({ isDefault: false })
        .where(and(
          eq(siteAccountPages.siteId, page.siteId),
          eq(siteAccountPages.isDefault, true),
          ne(siteAccountPages.id, pageId)
        ))
    }

    // Build update object with camelCase keys
    const updateValues: Record<string, unknown> = { updatedAt: new Date() }
    if (updates.title !== undefined) updateValues.title = updates.title
    if (updates.slug !== undefined) updateValues.slug = updates.slug
    if (updates.meta_description !== undefined) updateValues.metaDescription = updates.meta_description
    if (updates.content_blocks !== undefined) {
      const contentBlocksError = validateContentBlocks(updates.content_blocks)
      if (contentBlocksError) {
        return NextResponse.json(
          { data: null, error: contentBlocksError },
          { status: 400 }
        )
      }

      updateValues.contentBlocks = updates.content_blocks
    }
    if (updates.display_order !== undefined) updateValues.displayOrder = updates.display_order
    if (updates.is_default !== undefined) updateValues.isDefault = updates.is_default
    if (updates.is_published !== undefined) updateValues.isPublished = updates.is_published

    // Update the page
    const [updatedPage] = await db.update(siteAccountPages)
      .set(updateValues)
      .where(eq(siteAccountPages.id, pageId))
      .returning()

    return NextResponse.json({ data: updatedPage, error: null })
  } catch (error) {
    console.error('API Error:', error)
    return NextResponse.json(
      {
        data: null,
        error: 'Server error'
      },
      { status: 500 }
    )
  }
}
