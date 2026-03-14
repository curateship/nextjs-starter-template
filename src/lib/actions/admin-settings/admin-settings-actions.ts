'use server'

import { createClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase/server'

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

export interface AdminSettings {
  id: string
  settings: {
    font_family?: string
    secondary_font_family?: string
    font_weights?: string[]
    secondary_font_weights?: string[]
    default_theme?: 'system' | 'light' | 'dark'
    dashboard_page_size?: number
  }
  created_at: string
  updated_at: string
}

export interface UpdateAdminSettingsData {
  font_family?: string
  secondary_font_family?: string
  font_weights?: string[]
  secondary_font_weights?: string[]
  default_theme?: 'system' | 'light' | 'dark'
  dashboard_page_size?: number
}

/**
 * Get admin settings
 * Returns the first (and only) row from admin_settings table
 */
export async function getAdminSettingsAction(): Promise<{
  success: boolean
  data?: AdminSettings
  error?: string
}> {
  try {
    const supabase = await createServerSupabaseClient()

    // Verify user is authenticated and is super_admin
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return { success: false, error: 'Authentication required' }
    }

    if (user.app_metadata?.role !== 'super_admin') {
      return { success: false, error: 'Forbidden: super_admin role required' }
    }

    // Fetch admin settings (there should only be one row)
    const { data, error } = await supabase
      .from('admin_settings')
      .select('*')
      .single()

    if (error) {
      console.error('Error fetching admin settings:', error)
      return {
        success: false,
        error: error.message
      }
    }

    return {
      success: true,
      data: data as AdminSettings
    }
  } catch (error) {
    console.error('Error in getAdminSettingsAction:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unexpected error occurred'
    }
  }
}

/**
 * Update admin settings
 * Updates the settings JSONB field in the admin_settings table
 */
export async function updateAdminSettingsAction(
  settingsData: UpdateAdminSettingsData
): Promise<{
  success: boolean
  data?: AdminSettings
  error?: string
}> {
  try {
    const supabase = await createServerSupabaseClient()

    // Verify user is authenticated and is super_admin
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return { success: false, error: 'Authentication required' }
    }

    if (user.app_metadata?.role !== 'super_admin') {
      return { success: false, error: 'Forbidden: super_admin role required' }
    }

    // Get current settings first
    const { data: currentSettings, error: fetchError } = await supabase
      .from('admin_settings')
      .select('*')
      .single()

    if (fetchError) {
      console.error('Error fetching current admin settings:', fetchError)
      return {
        success: false,
        error: fetchError.message
      }
    }

    // Merge new settings with existing settings
    const updatedSettings = {
      ...currentSettings.settings,
      ...settingsData
    }

    // Update the settings using admin client to bypass RLS
    const { data, error } = await supabaseAdmin
      .from('admin_settings')
      .update({ settings: updatedSettings })
      .eq('id', currentSettings.id)
      .select()
      .single()

    if (error) {
      console.error('Error updating admin settings:', error)
      return {
        success: false,
        error: error.message
      }
    }

    // Revalidate admin layout to apply new fonts
    revalidatePath('/admin', 'layout')

    return {
      success: true,
      data: data as AdminSettings
    }
  } catch (error) {
    console.error('Error in updateAdminSettingsAction:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unexpected error occurred'
    }
  }
}
