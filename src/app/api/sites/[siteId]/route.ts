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
  { params }: { params: Promise<{ siteId: string }> }
) {
  try {
    const { siteId } = await params
    
    // Validate site ID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(siteId)) {
      return NextResponse.json(
        { data: null, error: 'Invalid site ID format' },
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

    // Get the site using the same view as the original action
    const { data: site, error: siteError } = await supabaseAdmin
      .from('site_details')
      .select('*')
      .eq('id', siteId)
      .single()

    if (siteError) {
      if (siteError.code === 'PGRST116') {
        return NextResponse.json(
          { data: null, error: 'Site not found' },
          { status: 404 }
        )
      }
      return NextResponse.json(
        { data: null, error: `Failed to fetch site: ${siteError.message}` },
        { status: 500 }
      )
    }

    if (!site) {
      return NextResponse.json(
        { data: null, error: 'Site not found' },
        { status: 404 }
      )
    }

    // Verify user owns this site
    if (site.user_id !== user.id) {
      return NextResponse.json(
        { data: null, error: 'Access denied' },
        { status: 403 }
      )
    }

    return NextResponse.json({ data: site, error: null })
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