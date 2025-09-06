import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Create admin client
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Create server client to access user session
async function createServerSupabaseClient() {
  const cookieStore = await cookies()
  
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Ignore errors from server components
          }
        },
      },
    }
  )
}

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
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json(
        { data: null, error: 'User not authenticated' },
        { status: 401 }
      )
    }

    // Get the product
    const { data: product, error: productError } = await supabaseAdmin
      .from('products')
      .select('*')
      .eq('id', productId)
      .single()

    if (productError) {
      if (productError.code === 'PGRST116') {
        return NextResponse.json(
          { data: null, error: 'Product not found' },
          { status: 404 }
        )
      }
      return NextResponse.json(
        { data: null, error: `Failed to fetch product: ${productError.message}` },
        { status: 500 }
      )
    }

    if (!product) {
      return NextResponse.json(
        { data: null, error: 'Product not found' },
        { status: 404 }
      )
    }

    // Verify user owns the site this product belongs to
    const { data: site, error: siteError } = await supabaseAdmin
      .from('sites')
      .select('id, user_id')
      .eq('id', product.site_id)
      .eq('user_id', user.id)
      .single()

    if (siteError || !site) {
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
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json(
        { data: null, error: 'User not authenticated' },
        { status: 401 }
      )
    }

    // Get the product first
    const { data: product, error: productError } = await supabaseAdmin
      .from('products')
      .select('*')
      .eq('id', productId)
      .single()

    if (productError || !product) {
      return NextResponse.json(
        { data: null, error: 'Product not found' },
        { status: 404 }
      )
    }

    // Verify user owns the site this product belongs to
    const { data: site, error: siteError } = await supabaseAdmin
      .from('sites')
      .select('id, user_id')
      .eq('id', product.site_id)
      .eq('user_id', user.id)
      .single()

    if (siteError || !site) {
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
      const { data: existingProduct } = await supabaseAdmin
        .from('products')
        .select('id')
        .eq('site_id', product.site_id)
        .eq('slug', slug)
        .single()
      
      if (existingProduct && existingProduct.id !== productId) {
        return NextResponse.json(
          { data: null, error: `A product with the slug "${slug}" already exists. Please choose a different slug.` },
          { status: 400 }
        )
      }
    }

    // Update the product
    const { data: updatedProduct, error: updateError } = await supabaseAdmin
      .from('products')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', productId)
      .select()
      .single()

    if (updateError) {
      return NextResponse.json(
        { data: null, error: `Failed to update product: ${updateError.message}` },
        { status: 500 }
      )
    }

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