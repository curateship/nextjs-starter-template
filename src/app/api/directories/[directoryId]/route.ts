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
  _request: NextRequest,
  { params }: { params: Promise<{ directoryId: string }> }
) {
  try {
    const { directoryId } = await params
    
    // Validate directory ID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(directoryId)) {
      return NextResponse.json(
        { data: null, error: 'Invalid directory ID format' },
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

    // Get the directory
    const { data: directory, error: directoryError } = await supabaseAdmin
      .from('directory')
      .select('*')
      .eq('id', directoryId)
      .single()

    if (directoryError) {
      if (directoryError.code === 'PGRST116') {
        return NextResponse.json(
          { data: null, error: 'Directory not found' },
          { status: 404 }
        )
      }
      return NextResponse.json(
        { data: null, error: `Failed to fetch directory: ${directoryError.message}` },
        { status: 500 }
      )
    }

    if (!directory) {
      return NextResponse.json(
        { data: null, error: 'Directory not found' },
        { status: 404 }
      )
    }

    // Verify user owns the site this directory belongs to
    const { data: site, error: siteError } = await supabaseAdmin
      .from('sites')
      .select('id, user_id')
      .eq('id', directory.site_id)
      .eq('user_id', user.id)
      .single()

    if (siteError || !site) {
      return NextResponse.json(
        { data: null, error: 'Site not found or access denied' },
        { status: 403 }
      )
    }

    return NextResponse.json({ data: directory, error: null })
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
  { params }: { params: Promise<{ directoryId: string }> }
) {
  try {
    const { directoryId } = await params
    const updates = await request.json()
    
    // Validate directory ID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(directoryId)) {
      return NextResponse.json(
        { data: null, error: 'Invalid directory ID format' },
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

    // Get the directory first
    const { data: directory, error: directoryError } = await supabaseAdmin
      .from('directory')
      .select('*')
      .eq('id', directoryId)
      .single()

    if (directoryError || !directory) {
      return NextResponse.json(
        { data: null, error: 'Directory not found' },
        { status: 404 }
      )
    }

    // Verify user owns the site this directory belongs to
    const { data: site, error: siteError } = await supabaseAdmin
      .from('sites')
      .select('id, user_id')
      .eq('id', directory.site_id)
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
        { data: null, error: 'Directory title cannot be empty' },
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

      // Check if slug conflicts with other directories (excluding current directory)
      const { data: existingDirectory } = await supabaseAdmin
        .from('directory')
        .select('id')
        .eq('site_id', directory.site_id)
        .eq('slug', slug)
        .single()
      
      if (existingDirectory && existingDirectory.id !== directoryId) {
        return NextResponse.json(
          { data: null, error: `A directory with the slug "${slug}" already exists. Please choose a different slug.` },
          { status: 400 }
        )
      }
    }

    // Update the directory
    const { data: updatedDirectory, error: updateError } = await supabaseAdmin
      .from('directory')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', directoryId)
      .select()
      .single()

    if (updateError) {
      return NextResponse.json(
        { data: null, error: `Failed to update directory: ${updateError.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({ data: updatedDirectory, error: null })
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