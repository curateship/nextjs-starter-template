import { NextRequest, NextResponse } from 'next/server'
import { eq, and } from 'drizzle-orm'
import { db } from '@/lib/db'
import { products, sites } from '@/lib/db/schema'
import { auth } from '@/lib/auth'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ productId: string }> }
) {
  try {
    const { productId } = await params

    // Validate product ID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(productId)) {
      return NextResponse.json(
        { data: null, error: 'Invalid product ID format' },
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

    // Get the product
    const product = await db.query.products.findFirst({
      where: eq(products.id, productId),
    })

    if (!product) {
      return NextResponse.json(
        { data: null, error: 'Product not found' },
        { status: 404 }
      )
    }

    // Verify user owns the site this product belongs to
    const site = await db.query.sites.findFirst({
      where: and(eq(sites.id, product.siteId), eq(sites.userId, userId)),
      columns: { id: true },
    })

    if (!site) {
      return NextResponse.json(
        { data: null, error: 'Site not found or access denied' },
        { status: 403 }
      )
    }

    return NextResponse.json({ data: product, error: null })
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
  { params }: { params: Promise<{ productId: string }> }
) {
  try {
    const { productId } = await params
    const updates = await request.json()

    // Validate product ID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(productId)) {
      return NextResponse.json(
        { data: null, error: 'Invalid product ID format' },
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

    // Get the product first
    const product = await db.query.products.findFirst({
      where: eq(products.id, productId),
    })

    if (!product) {
      return NextResponse.json(
        { data: null, error: 'Product not found' },
        { status: 404 }
      )
    }

    // Verify user owns the site this product belongs to
    const site = await db.query.sites.findFirst({
      where: and(eq(sites.id, product.siteId), eq(sites.userId, userId)),
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
        { data: null, error: 'Product title cannot be empty' },
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

      // Check if slug conflicts with other products (excluding current product)
      const existingProduct = await db.query.products.findFirst({
        where: and(eq(products.siteId, product.siteId), eq(products.slug, slug)),
        columns: { id: true },
      })

      if (existingProduct && existingProduct.id !== productId) {
        return NextResponse.json(
          { data: null, error: `A product with the slug "${slug}" already exists. Please choose a different slug.` },
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
    if (updates.is_homepage !== undefined) updateValues.isHomepage = updates.is_homepage
    if (updates.is_published !== undefined) updateValues.isPublished = updates.is_published
    if (updates.display_order !== undefined) updateValues.displayOrder = updates.display_order
    if (updates.content_blocks !== undefined) updateValues.contentBlocks = updates.content_blocks

    // Update the product
    const [updatedProduct] = await db.update(products)
      .set(updateValues)
      .where(eq(products.id, productId))
      .returning()

    return NextResponse.json({ data: updatedProduct, error: null })
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
