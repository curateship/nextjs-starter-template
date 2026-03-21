import { NextRequest, NextResponse } from 'next/server'
import { eq, and, desc } from 'drizzle-orm'
import { db } from '@/lib/db'
import { posts, sites } from '@/lib/db/schema'
import { auth } from '@/lib/auth'
import { applyDefaultBlocks } from '@/lib/utils/default-blocks'

export async function POST(request: NextRequest) {
  try {
    const postData = await request.json()

    // Validate required fields
    if (!postData.title?.trim()) {
      return NextResponse.json(
        { data: null, error: 'Post title is required' },
        { status: 400 }
      )
    }

    if (!postData.site_id) {
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
      where: and(eq(sites.id, postData.site_id), eq(sites.userId, userId)),
      columns: { id: true, userId: true, settings: true },
    })

    if (!site) {
      return NextResponse.json(
        { data: null, error: 'Site not found or access denied' },
        { status: 403 }
      )
    }

    // Generate slug from title if not provided
    let slug = postData.slug
    if (!slug) {
      slug = postData.title
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

    // Check if slug conflicts with existing posts in this site
    const existingPost = await db.query.posts.findFirst({
      where: and(eq(posts.siteId, postData.site_id), eq(posts.slug, slug)),
      columns: { title: true },
    })

    if (existingPost) {
      return NextResponse.json(
        { data: null, error: `This slug is already used by another post titled "${existingPost.title}". Please choose a different slug.` },
        { status: 400 }
      )
    }

    // Get the next display order
    const orderData = await db.query.posts.findFirst({
      where: eq(posts.siteId, postData.site_id),
      orderBy: [desc(posts.displayOrder)],
      columns: { displayOrder: true },
    })

    const nextOrder = orderData ? orderData.displayOrder + 1 : 1

    // Create the post
    const siteSettings = site.settings as Record<string, unknown> | null
    const defaultBlocks = (siteSettings?.default_blocks as Record<string, unknown> | undefined)?.posts

    const [newPost] = await db.insert(posts)
      .values({
        siteId: postData.site_id,
        title: postData.title.trim(),
        slug,
        isPublished: postData.is_published !== false,
        displayOrder: nextOrder,
        featuredImage: postData.featured_image || null,
        excerpt: postData.excerpt || null,
        metaDescription: postData.meta_description || null,
        contentBlocks: applyDefaultBlocks(postData.content_blocks, 'posts', defaultBlocks as string[] | undefined),
      })
      .returning()

    return NextResponse.json({ data: newPost, error: null }, { status: 201 })
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
