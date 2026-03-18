import { NextRequest, NextResponse } from 'next/server'
import { eq, and, desc } from 'drizzle-orm'
import { db } from '@/lib/db'
import { events, sites } from '@/lib/db/schema'
import { auth } from '@/lib/auth'
import { applyDefaultBlocks } from '@/lib/utils/default-blocks'

export async function POST(request: NextRequest) {
  try {
    const eventData = await request.json()

    // Validate required fields
    if (!eventData.title?.trim()) {
      return NextResponse.json(
        { data: null, error: 'Event title is required' },
        { status: 400 }
      )
    }

    if (!eventData.site_id) {
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
      where: and(eq(sites.id, eventData.site_id), eq(sites.userId, userId)),
      columns: { id: true, userId: true, settings: true },
    })

    if (!site) {
      return NextResponse.json(
        { data: null, error: 'Site not found or access denied' },
        { status: 403 }
      )
    }

    // Generate slug from title if not provided
    let slug = eventData.slug
    if (!slug) {
      slug = eventData.title
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
    const reservedSlugs = ['api', 'admin', 'www', 'mail', 'ftp', 'global']
    if (reservedSlugs.includes(slug.toLowerCase())) {
      return NextResponse.json(
        { data: null, error: 'This slug is reserved and cannot be used.' },
        { status: 400 }
      )
    }

    // Check if slug conflicts with existing events in this site
    const existingEvent = await db.query.events.findFirst({
      where: and(eq(events.siteId, eventData.site_id), eq(events.slug, slug)),
      columns: { title: true },
    })

    if (existingEvent) {
      return NextResponse.json(
        { data: null, error: `This slug is already used by another event titled "${existingEvent.title}". Please choose a different slug.` },
        { status: 400 }
      )
    }

    // Get the next display order
    const orderData = await db.query.events.findFirst({
      where: eq(events.siteId, eventData.site_id),
      orderBy: [desc(events.displayOrder)],
      columns: { displayOrder: true },
    })

    const nextOrder = orderData ? orderData.displayOrder + 1 : 1

    // Create the event
    const siteSettings = site.settings as Record<string, unknown> | null
    const defaultBlocks = (siteSettings?.default_blocks as Record<string, unknown> | undefined)?.events

    const [newEvent] = await db.insert(events)
      .values({
        siteId: eventData.site_id,
        title: eventData.title.trim(),
        slug,
        isPublished: eventData.is_published !== false,
        displayOrder: nextOrder,
        featuredImage: eventData.featured_image || null,
        description: eventData.description || null,
        metaDescription: eventData.meta_description || null,
        contentBlocks: applyDefaultBlocks(eventData.content_blocks, 'events', defaultBlocks as string[] | undefined),
      })
      .returning()

    return NextResponse.json({ data: newEvent, error: null }, { status: 201 })
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
