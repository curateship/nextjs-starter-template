import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { applyDefaultBlocks } from '@/lib/utils/default-blocks'

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
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json(
        { data: null, error: 'User not authenticated' },
        { status: 401 }
      )
    }

    // Verify user owns the site
    const { data: site, error: siteError } = await supabaseAdmin
      .from('sites')
      .select('id, user_id, settings')
      .eq('id', postData.site_id)
      .eq('user_id', user.id)
      .single()

    if (siteError || !site) {
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
    const { data: existingPost } = await supabaseAdmin
      .from('posts')
      .select('title')
      .eq('site_id', postData.site_id)
      .eq('slug', slug)
      .single()
    
    if (existingPost) {
      return NextResponse.json(
        { data: null, error: `This slug is already used by another post titled "${existingPost.title}". Please choose a different slug.` },
        { status: 400 }
      )
    }

    // Get the next display order
    const { data: orderData } = await supabaseAdmin
      .from('posts')
      .select('display_order')
      .eq('site_id', postData.site_id)
      .order('display_order', { ascending: false })
      .limit(1)

    const nextOrder = orderData && orderData.length > 0 ? orderData[0].display_order + 1 : 1

    // Create the post
    const { data: newPost, error: createError } = await supabaseAdmin
      .from('posts')
      .insert([{
        site_id: postData.site_id,
        title: postData.title.trim(),
        slug,
        is_published: postData.is_published !== false,
        display_order: nextOrder,
        featured_image: postData.featured_image || null,
        excerpt: postData.excerpt || null,
        meta_description: postData.meta_description || null,
        content_blocks: applyDefaultBlocks(postData.content_blocks, 'posts', site.settings?.default_blocks?.posts)
      }])
      .select()
      .single()

    if (createError) {
      return NextResponse.json(
        { data: null, error: `Failed to create post: ${createError.message}` },
        { status: 500 }
      )
    }

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