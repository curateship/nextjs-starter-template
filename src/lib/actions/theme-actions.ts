'use server'

import { createClient } from '@supabase/supabase-js'
import type { Theme, CreateThemeData, UpdateThemeData } from '@/lib/supabase/themes'

// Create admin client with service role key for server actions
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

export async function getAllThemesAction(): Promise<{ data: Theme[] | null; error: string | null }> {
  try {
    // Fetching all themes with admin privileges
    
    const { data, error } = await supabaseAdmin
      .from('themes')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      // Database error in server action
      return { data: null, error: `Database error: ${error.message}` }
    }

    // Successfully fetched themes
    return { data: data as Theme[], error: null }
  } catch (error) {
    // Unexpected error in server action
    return { 
      data: null, 
      error: `Server error: ${error instanceof Error ? error.message : String(error)}` 
    }
  }
}

export async function updateThemeStatusAction(
  themeId: string, 
  status: 'active' | 'inactive' | 'development'
): Promise<{ data: Theme | null; error: string | null }> {
  try {
    // Updating theme status
    
    const { data, error } = await supabaseAdmin
      .from('themes')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', themeId)
      .select()
      .single()

    if (error) {
      // Database error updating theme
      return { data: null, error: `Database error: ${error.message}` }
    }

    // Successfully updated theme status
    return { data: data as Theme, error: null }
  } catch (error) {
    // Unexpected error updating theme
    return { 
      data: null, 
      error: `Server error: ${error instanceof Error ? error.message : String(error)}` 
    }
  }
}

export async function getActiveThemesAction(): Promise<{ data: Theme[] | null; error: string | null }> {
  try {
    const { data, error } = await supabaseAdmin
      .from('themes')
      .select('*')
      .eq('status', 'active')
      .order('name', { ascending: true })

    if (error) {
      // Database error fetching active themes
      return { data: null, error: `Database error: ${error.message}` }
    }

    return { data: data as Theme[], error: null }
  } catch (error) {
    // Unexpected error fetching active themes
    return { 
      data: null, 
      error: `Server error: ${error instanceof Error ? error.message : String(error)}` 
    }
  }
}

export async function updateThemeAction(
  themeId: string, 
  updates: {
    name?: string
    description?: string
    status?: 'active' | 'inactive' | 'development'
    metadata?: any
  }
): Promise<{ data: Theme | null; error: string | null }> {
  try {
    // Validate theme ID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(themeId)) {
      return { data: null, error: 'Invalid theme ID format' }
    }

    const { data, error } = await supabaseAdmin
      .from('themes')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', themeId)
      .select()
      .single()

    if (error) {
      return { data: null, error: `Failed to update theme: ${error.message}` }
    }

    return { data: data as Theme, error: null }
  } catch (error) {
    return { 
      data: null, 
      error: `Server error: ${error instanceof Error ? error.message : String(error)}` 
    }
  }
}

export async function deleteThemeAction(themeId: string): Promise<{ success: boolean; error: string | null }> {
  try {
    // Validate theme ID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(themeId)) {
      return { success: false, error: 'Invalid theme ID format' }
    }

    // Check if theme is being used by any sites
    const { data: sitesUsingTheme, error: sitesError } = await supabaseAdmin
      .from('sites')
      .select('id')
      .eq('theme_id', themeId)
      .limit(1)

    if (sitesError) {
      return { success: false, error: `Database error: ${sitesError.message}` }
    }

    if (sitesUsingTheme && sitesUsingTheme.length > 0) {
      return { success: false, error: 'Cannot delete theme that is currently being used by sites' }
    }

    // Delete theme
    const { error } = await supabaseAdmin
      .from('themes')
      .delete()
      .eq('id', themeId)

    if (error) {
      return { success: false, error: `Failed to delete theme: ${error.message}` }
    }

    return { success: true, error: null }
  } catch (error) {
    return { 
      success: false, 
      error: `Server error: ${error instanceof Error ? error.message : String(error)}` 
    }
  }
}

// claude.md followed