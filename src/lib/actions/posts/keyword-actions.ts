'use server'

import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Create admin client with service role key for admin operations
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
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
            // The `setAll` method was called from a Server Component.
          }
        },
      },
    }
  )
}

export interface KeywordResearch {
  id: string
  site_id: string
  keyword: string
  search_volume: number | null
  keyword_difficulty: number | null
  cpc: number | null
  competition: number | null
  competition_level: string | null
  search_intent: string | null
  monthly_searches: { year: number; month: number; search_volume: number }[] | null
  is_saved: boolean
  data_source: string
  created_at: string
  updated_at: string
}

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Get all keywords for a site
 */
export async function getSiteKeywordsAction(siteId: string): Promise<{ data: KeywordResearch[] | null; error: string | null }> {
  try {
    if (!uuidRegex.test(siteId)) {
      return { data: null, error: 'Invalid site ID format' }
    }

    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return { data: null, error: 'User not authenticated. Please log in first.' }
    }

    // Verify user owns this site
    const { data: site, error: siteError } = await supabaseAdmin
      .from('sites')
      .select('id, user_id')
      .eq('id', siteId)
      .eq('user_id', user.id)
      .single()

    if (siteError || !site) {
      return { data: null, error: 'Site not found or access denied' }
    }

    const { data, error } = await supabaseAdmin
      .from('posts_keywords')
      .select('*')
      .eq('site_id', siteId)
      .order('search_volume', { ascending: false, nullsFirst: false })

    if (error) {
      if (error.message.includes('relation') && error.message.includes('does not exist')) {
        return { data: [], error: null }
      }
      return { data: null, error: `Failed to fetch keywords: ${error.message}` }
    }

    return { data: (data || []) as KeywordResearch[], error: null }
  } catch (error) {
    return {
      data: null,
      error: `Server error: ${error instanceof Error ? error.message : String(error)}`
    }
  }
}

/**
 * Get saved keywords for a site
 */
export async function getSavedKeywordsAction(siteId: string): Promise<{ data: KeywordResearch[] | null; error: string | null }> {
  try {
    if (!uuidRegex.test(siteId)) {
      return { data: null, error: 'Invalid site ID format' }
    }

    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return { data: null, error: 'User not authenticated. Please log in first.' }
    }

    const { data: site, error: siteError } = await supabaseAdmin
      .from('sites')
      .select('id, user_id')
      .eq('id', siteId)
      .eq('user_id', user.id)
      .single()

    if (siteError || !site) {
      return { data: null, error: 'Site not found or access denied' }
    }

    const { data, error } = await supabaseAdmin
      .from('posts_keywords')
      .select('*')
      .eq('site_id', siteId)
      .eq('is_saved', true)
      .order('search_volume', { ascending: false, nullsFirst: false })

    if (error) {
      if (error.message.includes('relation') && error.message.includes('does not exist')) {
        return { data: [], error: null }
      }
      return { data: null, error: `Failed to fetch saved keywords: ${error.message}` }
    }

    return { data: (data || []) as KeywordResearch[], error: null }
  } catch (error) {
    return {
      data: null,
      error: `Server error: ${error instanceof Error ? error.message : String(error)}`
    }
  }
}

/**
 * Toggle save/unsave a keyword
 */
export async function toggleSaveKeywordAction(keywordId: string, isSaved: boolean): Promise<{ data: KeywordResearch | null; error: string | null }> {
  try {
    if (!uuidRegex.test(keywordId)) {
      return { data: null, error: 'Invalid keyword ID format' }
    }

    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return { data: null, error: 'User not authenticated. Please log in first.' }
    }

    // Get keyword to check ownership
    const { data: keyword, error: keywordError } = await supabaseAdmin
      .from('posts_keywords')
      .select('*, sites!inner(user_id)')
      .eq('id', keywordId)
      .single()

    if (keywordError || !keyword) {
      return { data: null, error: 'Keyword not found' }
    }

    if ((keyword as any).sites?.user_id !== user.id) {
      return { data: null, error: 'Access denied' }
    }

    const { data, error } = await supabaseAdmin
      .from('posts_keywords')
      .update({ is_saved: isSaved })
      .eq('id', keywordId)
      .select()
      .single()

    if (error) {
      return { data: null, error: `Failed to update keyword: ${error.message}` }
    }

    return { data: data as KeywordResearch, error: null }
  } catch (error) {
    return {
      data: null,
      error: `Server error: ${error instanceof Error ? error.message : String(error)}`
    }
  }
}

/**
 * Delete a keyword
 */
export async function deleteKeywordAction(keywordId: string): Promise<{ success: boolean; error: string | null }> {
  try {
    if (!uuidRegex.test(keywordId)) {
      return { success: false, error: 'Invalid keyword ID format' }
    }

    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return { success: false, error: 'User not authenticated. Please log in first.' }
    }

    // Get keyword to check ownership
    const { data: keyword, error: keywordError } = await supabaseAdmin
      .from('posts_keywords')
      .select('*, sites!inner(user_id)')
      .eq('id', keywordId)
      .single()

    if (keywordError || !keyword) {
      return { success: false, error: 'Keyword not found' }
    }

    if ((keyword as any).sites?.user_id !== user.id) {
      return { success: false, error: 'Access denied' }
    }

    const { error } = await supabaseAdmin
      .from('posts_keywords')
      .delete()
      .eq('id', keywordId)

    if (error) {
      return { success: false, error: `Failed to delete keyword: ${error.message}` }
    }

    return { success: true, error: null }
  } catch (error) {
    return {
      success: false,
      error: `Server error: ${error instanceof Error ? error.message : String(error)}`
    }
  }
}

/**
 * Delete all unsaved keywords for a site
 */
export async function deleteAllUnsavedKeywordsAction(siteId: string): Promise<{ success: boolean; error: string | null }> {
  try {
    if (!uuidRegex.test(siteId)) {
      return { success: false, error: 'Invalid site ID format' }
    }

    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return { success: false, error: 'User not authenticated. Please log in first.' }
    }

    const { data: site, error: siteError } = await supabaseAdmin
      .from('sites')
      .select('id, user_id')
      .eq('id', siteId)
      .eq('user_id', user.id)
      .single()

    if (siteError || !site) {
      return { success: false, error: 'Site not found or access denied' }
    }

    const { error } = await supabaseAdmin
      .from('posts_keywords')
      .delete()
      .eq('site_id', siteId)
      .eq('is_saved', false)

    if (error) {
      return { success: false, error: `Failed to delete unsaved keywords: ${error.message}` }
    }

    return { success: true, error: null }
  } catch (error) {
    return {
      success: false,
      error: `Server error: ${error instanceof Error ? error.message : String(error)}`
    }
  }
}
