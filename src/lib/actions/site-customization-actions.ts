"use server"

import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)

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
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options)
          })
        },
      },
    }
  )
}

export interface SiteCustomization {
  id: string
  site_id: string
  page_path: string
  block_type: string
  block_identifier: string
  customizations: Record<string, any>
  version: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface SaveBlockCustomizationParams {
  site_id: string
  page_path?: string
  block_type: string
  block_identifier: string
  customizations: Record<string, any>
}

/**
 * Save block customization to database
 */
export async function saveBlockCustomizationAction(params: SaveBlockCustomizationParams) {
  try {
    const {
      site_id,
      page_path = '/',
      block_type,
      block_identifier,
      customizations
    } = params

    // Get current site settings
    const { data: site, error: fetchError } = await supabaseAdmin
      .from('sites')
      .select('settings')
      .eq('id', site_id)
      .single()
    
    if (fetchError) {
      return { success: false, error: `Site not found: ${site_id}` }
    }

    // Merge customizations into site settings
    const currentSettings = site?.settings || {}
    const blockCustomizations = currentSettings.blockCustomizations || {}
    
    // Store customizations by page and block
    if (!blockCustomizations[page_path]) {
      blockCustomizations[page_path] = {}
    }
    blockCustomizations[page_path][block_identifier] = {
      type: block_type,
      content: customizations,
      updatedAt: new Date().toISOString()
    }

    // Update site settings with new customizations
    const { error: updateError } = await supabaseAdmin
      .from('sites')
      .update({
        settings: {
          ...currentSettings,
          blockCustomizations
        },
        updated_at: new Date().toISOString()
      })
      .eq('id', site_id)
    
    if (updateError) {
      return { success: false, error: updateError.message }
    }

    return { success: true, customization_id: site_id }

  } catch (error) {
    console.error('Save error:', error)
    return { success: false, error: 'Save failed' }
  }
}

/**
 * Get site page customizations
 */
export async function getSitePageCustomizationsAction(site_id: string, page_path: string = '/') {
  try {
    // Validate user authentication
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    
    if (userError || !user) {
      return { success: false, error: 'Authentication required' }
    }

    // Verify user owns the site
    const { data: site, error: siteError } = await supabaseAdmin
      .from('sites')
      .select('id, user_id')
      .eq('id', site_id)
      .eq('user_id', user.id)
      .single()

    if (siteError || !site) {
      return { success: false, error: 'Site not found or access denied' }
    }

    // Get customizations using the database function
    const { data, error } = await supabaseAdmin
      .rpc('get_site_page_customizations', {
        p_site_id: site_id,
        p_page_path: page_path
      })

    if (error) {
      console.error('Error getting site page customizations:', error)
      return { success: false, error: 'Failed to load customizations' }
    }

    return { 
      success: true, 
      customizations: data || []
    }

  } catch (error) {
    console.error('Error in getSitePageCustomizationsAction:', error)
    return { success: false, error: 'Internal server error' }
  }
}

/**
 * Rollback block customization to previous version
 */
export async function rollbackBlockCustomizationAction(
  site_id: string,
  page_path: string,
  block_type: string,
  block_identifier: string,
  target_version?: number
) {
  try {
    // Validate user authentication
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    
    if (userError || !user) {
      return { success: false, error: 'Authentication required' }
    }

    // Verify user owns the site
    const { data: site, error: siteError } = await supabaseAdmin
      .from('sites')
      .select('id, user_id')
      .eq('id', site_id)
      .eq('user_id', user.id)
      .single()

    if (siteError || !site) {
      return { success: false, error: 'Site not found or access denied' }
    }

    // Use the database function to rollback customization
    const { data, error } = await supabaseAdmin
      .rpc('rollback_block_customization', {
        p_site_id: site_id,
        p_page_path: page_path,
        p_block_type: block_type,
        p_block_identifier: block_identifier,
        p_target_version: target_version || null
      })

    if (error) {
      console.error('Error rolling back block customization:', error)
      return { success: false, error: 'Failed to rollback customization' }
    }

    if (!data) {
      return { success: false, error: 'Target version not found' }
    }

    return { 
      success: true, 
      message: 'Block customization rolled back successfully' 
    }

  } catch (error) {
    console.error('Error in rollbackBlockCustomizationAction:', error)
    return { success: false, error: 'Internal server error' }
  }
}

