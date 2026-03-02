import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getKeywordSuggestions } from '@/lib/services/dataforseo/keyword-research'

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
    const { seedKeyword, siteId } = await request.json()

    // Validate required fields
    if (!seedKeyword?.trim()) {
      return NextResponse.json(
        { data: null, error: 'Seed keyword is required' },
        { status: 400 }
      )
    }

    if (!siteId) {
      return NextResponse.json(
        { data: null, error: 'Site ID is required' },
        { status: 400 }
      )
    }

    // Auth check
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
      .select('id, user_id')
      .eq('id', siteId)
      .eq('user_id', user.id)
      .single()

    if (siteError || !site) {
      return NextResponse.json(
        { data: null, error: 'Site not found or access denied' },
        { status: 403 }
      )
    }

    // Call DataForSEO
    const suggestions = await getKeywordSuggestions(seedKeyword.trim(), { siteId })

    // Upsert results into posts_keywords table
    const rows = suggestions.map(item => ({
      site_id: siteId,
      keyword: item.keyword,
      search_volume: item.keyword_info?.search_volume ?? null,
      keyword_difficulty: item.keyword_properties?.keyword_difficulty ?? null,
      cpc: item.keyword_info?.cpc ?? null,
      competition: item.keyword_info?.competition ?? null,
      competition_level: item.keyword_info?.competition_level ?? null,
      search_intent: item.search_intent_info?.main_intent ?? null,
      monthly_searches: item.keyword_info?.monthly_searches ?? null,
      data_source: 'dataforseo',
    }))

    if (rows.length === 0) {
      return NextResponse.json({ data: [], error: null })
    }

    const { data: upsertedData, error: upsertError } = await supabaseAdmin
      .from('posts_keywords')
      .upsert(rows, {
        onConflict: 'site_id,keyword',
        ignoreDuplicates: false,
      })
      .select()

    if (upsertError) {
      console.error('Upsert error:', upsertError)
      return NextResponse.json(
        { data: null, error: `Failed to save keywords: ${upsertError.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({ data: upsertedData, error: null })
  } catch (error) {
    console.error('Keyword research API error:', error)
    return NextResponse.json(
      {
        data: null,
        error: `Server error: ${error instanceof Error ? error.message : String(error)}`
      },
      { status: 500 }
    )
  }
}
