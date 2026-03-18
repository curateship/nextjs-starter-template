import { NextRequest, NextResponse } from 'next/server'
import { eq, and } from 'drizzle-orm'
import { db } from '@/lib/db'
import { posts, sites } from '@/lib/db/schema'
import { auth } from '@/lib/auth'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  try {
    const { postId } = await params

    // Validate post ID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(postId)) {
      return NextResponse.json(
        { data: null, error: 'Invalid post ID format' },
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

    // Get the post
    const post = await db.query.posts.findFirst({
      where: eq(posts.id, postId),
    })

    if (!post) {
      return NextResponse.json(
        { data: null, error: 'Post not found' },
        { status: 404 }
      )
    }

    // Verify user owns the site this post belongs to
    const site = await db.query.sites.findFirst({
      where: and(eq(sites.id, post.siteId), eq(sites.userId, userId)),
      columns: { id: true },
    })

    if (!site) {
      return NextResponse.json(
        { data: null, error: 'Site not found or access denied' },
        { status: 403 }
      )
    }

    return NextResponse.json({ data: post, error: null })
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
  { params }: { params: Promise<{ postId: string }> }
) {
  try {
    const { postId } = await params
    const updates = await request.json()

    // Validate post ID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(postId)) {
      return NextResponse.json(
        { data: null, error: 'Invalid post ID format' },
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

    // Get the post first
    const post = await db.query.posts.findFirst({
      where: eq(posts.id, postId),
    })

    if (!post) {
      return NextResponse.json(
        { data: null, error: 'Post not found' },
        { status: 404 }
      )
    }

    // Verify user owns the site this post belongs to
    const site = await db.query.sites.findFirst({
      where: and(eq(sites.id, post.siteId), eq(sites.userId, userId)),
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
        { data: null, error: 'Post title cannot be empty' },
        { status: 400 }
      )
    }

    // Validate and process slug if being updated
    if (updates.slug !== undefined) {
      const slug = updates.slug.trim()

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

      // Check if slug conflicts with other posts (excluding current post)
      const existingPost = await db.query.posts.findFirst({
        where: and(eq(posts.siteId, post.siteId), eq(posts.slug, slug)),
        columns: { id: true },
      })

      if (existingPost && existingPost.id !== postId) {
        return NextResponse.json(
          { data: null, error: `A post with the slug "${slug}" already exists. Please choose a different slug.` },
          { status: 400 }
        )
      }
    }

    // Build update object with camelCase keys
    const updateValues: Record<string, unknown> = { updatedAt: new Date() }
    if (updates.title !== undefined) updateValues.title = updates.title
    if (updates.slug !== undefined) updateValues.slug = updates.slug
    if (updates.meta_description !== undefined) updateValues.metaDescription = updates.meta_description
    if (updates.meta_keywords !== undefined) updateValues.metaKeywords = updates.meta_keywords
    if (updates.featured_image !== undefined) updateValues.featuredImage = updates.featured_image
    if (updates.excerpt !== undefined) updateValues.excerpt = updates.excerpt
    if (updates.content !== undefined) updateValues.content = updates.content
    if (updates.content_blocks !== undefined) updateValues.contentBlocks = updates.content_blocks
    if (updates.is_published !== undefined) updateValues.isPublished = updates.is_published
    if (updates.display_order !== undefined) updateValues.displayOrder = updates.display_order

    // Update the post
    const [updatedPost] = await db.update(posts)
      .set(updateValues)
      .where(eq(posts.id, postId))
      .returning()

    return NextResponse.json({ data: updatedPost, error: null })
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
