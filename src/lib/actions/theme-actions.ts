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

// claude.md followed