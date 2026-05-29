import { NextRequest, NextResponse } from 'next/server'
import { eq, and, desc } from 'drizzle-orm'
import { db } from '@/lib/db'
import { pages, sites } from '@/lib/db/schema'
import { auth } from '@/lib/actions/auth/server'
import { isSameOriginRequest } from '@/lib/utils/request-origin'
import { serializePage } from '@/lib/utils/content-serializer'

export async function POST(request: NextRequest) {
  try {
    if (!isSameOriginRequest(request)) {
      return NextResponse.json(
        { data: null, error: 'Invalid origin' },
        { status: 403 }
      )
    }

    const pageData = await request.json()

    // Validate required fields
    if (!pageData.title?.trim()) {
      return NextResponse.json(
        { data: null, error: 'Page title is required' },
        { status: 400 }
      )
    }

    if (!pageData.site_id) {
      return NextResponse.json(
        { data: null, error: 'Site ID is required' },
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

    // Verify user owns the site
    const site = await db.query.sites.findFirst({
      where: and(eq(sites.id, pageData.site_id), eq(sites.userId, userId)),
      columns: { id: true, userId: true, settings: true },
    })

    if (!site) {
      return NextResponse.json(
        { data: null, error: 'Site not found or access denied' },
        { status: 403 }
      )
    }

    // Generate slug from title if not provided
    let slug = pageData.slug
    if (!slug) {
      slug = pageData.title
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
    }

    // Validate slug format
    if (!/^[a-zA-Z0-9_-]+$/.test(slug)) {
      return NextResponse.json(
        { data: null, error: 'Invalid slug format. Use only letters, numbers, hyphens, and underscores.' },
        { status: 400 }
      )
    }

    // Check for reserved slugs
    const reservedSlugs = ['account', 'api', 'admin', 'maintenance', 'www', 'mail', 'ftp', 'global']
    if (reservedSlugs.includes(slug.toLowerCase())) {
      return NextResponse.json(
        { data: null, error: 'This slug is reserved and cannot be used.' },
        { status: 400 }
      )
    }

    // Check if slug conflicts with existing pages in this site
    const existingPage = await db.query.pages.findFirst({
      where: and(eq(pages.siteId, pageData.site_id), eq(pages.slug, slug)),
      columns: { title: true },
    })

    if (existingPage) {
      return NextResponse.json(
        { data: null, error: `This slug is already used by another page titled "${existingPage.title}". Please choose a different slug.` },
        { status: 400 }
      )
    }

    // If setting as homepage, unset any existing homepage
    if (pageData.is_homepage === true) {
      await db.update(pages)
        .set({ isHomepage: false })
        .where(and(eq(pages.siteId, pageData.site_id), eq(pages.isHomepage, true)))
    }

    // Get the next display order
    const orderData = await db.query.pages.findFirst({
      where: eq(pages.siteId, pageData.site_id),
      orderBy: [desc(pages.displayOrder)],
      columns: { displayOrder: true },
    })

    const nextOrder = orderData ? orderData.displayOrder + 1 : 1

    // Create the page
    const [newPage] = await db.insert(pages)
      .values({
        siteId: pageData.site_id,
        title: pageData.title.trim(),
        slug,
        isHomepage: pageData.is_homepage || false,
        isPublished: pageData.is_published !== false,
        displayOrder: nextOrder,
        metaDescription: pageData.meta_description || null,
      })
      .returning()

    return NextResponse.json({ data: serializePage(newPage), error: null }, { status: 201 })
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
