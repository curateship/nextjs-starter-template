'use server'

import { createClient } from '@supabase/supabase-js'
import { revalidateTag, revalidatePath } from 'next/cache'
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

export interface Site {
  id: string
  user_id: string
  name: string
  subdomain: string
  custom_domain: string | null
  status: 'active' | 'inactive' | 'draft' | 'suspended'
  is_template: boolean
  settings: Record<string, any>
  created_at: string
  updated_at: string
}

// Kept as alias for backward compatibility across the codebase
export type SiteWithTheme = Site

export interface CreateSiteData {
  name: string
  subdomain?: string
  custom_domain?: string | null
  status?: 'active' | 'inactive' | 'draft'
  is_template?: boolean
  settings?: Record<string, any>
  font_family?: string
  font_weights?: string[]
  secondary_font_family?: string
  secondary_font_weights?: string[]
  favicon?: string
  tracking_scripts?: string
  site_width?: 'full' | 'custom'
  custom_width?: number
  default_theme?: 'system' | 'light' | 'dark'
}

function sanitizeCustomDomain(input?: string | null): string | null {
  if (!input) return null
  let d = String(input).trim().toLowerCase()
  if (!d) return null
  // Remove protocol if present
  d = d.replace(/^https?:\/\//, '')
  // Remove any leading //
  d = d.replace(/^\/+/, '')
  // Strip path/query/fragment
  d = d.split('/')[0].split('?')[0].split('#')[0]
  // Empty after cleaning -> null
  if (!d) return null
  return d
}

export async function getAllSitesAction(): Promise<{ data: Site[] | null; error: string | null }> {
  try {
    // Verify user is authenticated
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return { data: null, error: 'Authentication required' }
    }

    // Fetch only non-template sites owned by the authenticated user
    const { data, error } = await supabaseAdmin
      .from('sites')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_template', false)
      .order('created_at', { ascending: false })

    if (error) {
      // Database error fetching sites
      return { data: null, error: `Database error: ${error.message}` }
    }

    // Successfully fetched sites
    return { data: data as Site[], error: null }
  } catch (error) {
      // Unexpected error fetching sites
    return {
      data: null,
      error: `Server error: ${error instanceof Error ? error.message : String(error)}`
    }
  }
}

export async function createSiteAction(siteData: CreateSiteData): Promise<{ data: Site | null; error: string | null }> {
  try {
    // Use provided subdomain or generate from name
    let subdomain = siteData.subdomain || siteData.name.toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')

    // Check if subdomain is available
    let subdomainSuffix = ''
    let attempts = 0
    while (attempts < 10) {
      const testSubdomain = subdomain + subdomainSuffix

      const { data: existing } = await supabaseAdmin
        .from('sites')
        .select('id')
        .eq('subdomain', testSubdomain)
        .single()

      if (!existing) {
        subdomain = testSubdomain
        break
      }

      attempts++
      subdomainSuffix = `-${attempts}`
    }

    // Get the authenticated user's ID from the session
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return { data: null, error: 'User not authenticated. Please log in first.' }
    }

    const actualUserId = user.id

    // Prepare settings with font, favicon, and animation configuration
    const settings = {
      ...(siteData.settings || {
        site_title: siteData.name,
        analytics_enabled: false,
        seo_enabled: true
      }),
      font_family: siteData.font_family || 'playfair-display',
      font_weights: siteData.font_weights || ['400', '500', '600', '700', '800', '900'],
      secondary_font_family: siteData.secondary_font_family || 'inter',
      secondary_font_weights: siteData.secondary_font_weights || ['300', '400', '500', '600', '700'],
      favicon: siteData.favicon || null,
      default_theme: siteData.default_theme || 'system',
    }

    // Create the site
    const { data, error } = await supabaseAdmin
      .from('sites')
      .insert([{
        name: siteData.name,
        user_id: actualUserId,
        subdomain,
        status: siteData.status || 'draft',
        is_template: siteData.is_template || false,
        custom_domain: sanitizeCustomDomain(siteData.custom_domain ?? null),
        settings
      }])
      .select()
      .single()

    if (error) {
      return { data: null, error: `Failed to create site: ${error.message}` }
    }

    return { data: data as Site, error: null }
  } catch (error) {
    return {
      data: null,
      error: `Server error: ${error instanceof Error ? error.message : String(error)}`
    }
  }
}

export async function updateSiteAction(
  siteId: string,
  updates: Partial<CreateSiteData>
): Promise<{ data: Site | null; error: string | null }> {
  try {
    // Verify user is authenticated and owns this site
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return { data: null, error: 'Authentication required' }
    }

    const { data: ownedSite, error: ownerError } = await supabaseAdmin
      .from('sites')
      .select('id')
      .eq('id', siteId)
      .eq('user_id', user.id)
      .single()

    if (ownerError || !ownedSite) {
      return { data: null, error: 'Site not found or access denied' }
    }

    // Prepare updates
    let finalUpdates: any = { ...updates }

    // If updating name but subdomain was NOT explicitly provided, regenerate subdomain
    if (updates.name && !updates.subdomain) {
      let subdomain = updates.name.toLowerCase()
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')

      // Check if subdomain is available (excluding current site)
      let subdomainSuffix = ''
      let attempts = 0
      while (attempts < 10) {
        const testSubdomain = subdomain + subdomainSuffix

        const { data: existing } = await supabaseAdmin
          .from('sites')
          .select('id')
          .eq('subdomain', testSubdomain)
          .neq('id', siteId) // Exclude current site
          .single()

        if (!existing) {
          subdomain = testSubdomain
          break
        }

        attempts++
        subdomainSuffix = `-${attempts}`
      }

      finalUpdates.subdomain = subdomain
    }
    
    // Normalize custom_domain (strip protocol, paths, empty -> null)
    if (finalUpdates.hasOwnProperty('custom_domain')) {
      finalUpdates.custom_domain = sanitizeCustomDomain(finalUpdates.custom_domain as any)
    }
    
    const { data, error } = await supabaseAdmin
      .from('sites')
      .update({
        ...finalUpdates,
        updated_at: new Date().toISOString()
      })
      .eq('id', siteId)
      .select()
      .single()

    if (error) {
      // Database error updating site
      return { data: null, error: `Failed to update site: ${error.message}` }
    }

    // Invalidate cached site data so changes take effect immediately
    revalidateTag('site-lookup')
    revalidateTag('all')
    revalidatePath('/', 'layout')

    // Successfully updated site
    return { data: data as Site, error: null }
  } catch (error) {
    // Unexpected error updating site
    return { 
      data: null, 
      error: `Server error: ${error instanceof Error ? error.message : String(error)}` 
    }
  }
}

export async function deleteSiteAction(siteId: string): Promise<{ success: boolean; error: string | null }> {
  try {
    // Validate site ID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(siteId)) {
      return { success: false, error: 'Invalid site ID format' }
    }

    // Get authenticated user
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return { success: false, error: 'Authentication required' }
    }

    // Verify user owns the site before deleting
    const { data: site, error: siteError } = await supabaseAdmin
      .from('sites')
      .select('id, user_id')
      .eq('id', siteId)
      .eq('user_id', user.id)
      .single()

    if (siteError || !site) {
      return { success: false, error: 'Site not found or you do not have permission to delete it' }
    }
    
    // Delete site (this will cascade delete page_blocks due to foreign key constraints)
    const { error } = await supabaseAdmin
      .from('sites')
      .delete()
      .eq('id', siteId)
      .eq('user_id', user.id) // Extra safety check

    if (error) {
      // Database error deleting site
      return { success: false, error: `Failed to delete site: ${error.message}` }
    }

    // Successfully deleted site
    return { success: true, error: null }
  } catch (error) {
    // Unexpected error deleting site
    return { 
      success: false, 
      error: `Server error: ${error instanceof Error ? error.message : String(error)}` 
    }
  }
}

export async function getSiteByIdAction(siteId: string): Promise<{ data: Site | null; error: string | null }> {
  try {
    // Verify user is authenticated and owns this site
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return { data: null, error: 'Authentication required' }
    }

    const { data, error } = await supabaseAdmin
      .from('sites')
      .select('*')
      .eq('id', siteId)
      .eq('user_id', user.id)
      .single()

    if (error) {
      return { data: null, error: 'Site not found or access denied' }
    }

    return { data: data as Site, error: null }
  } catch (error) {
    return {
      data: null,
      error: `Server error: ${error instanceof Error ? error.message : String(error)}`
    }
  }
}

export async function checkSubdomainAvailabilityAction(subdomain: string): Promise<{ available: boolean; suggestion?: string; error: string | null }> {
  try {
    const { data: existing } = await supabaseAdmin
      .from('sites')
      .select('id')
      .eq('subdomain', subdomain)
      .single()
    
    if (!existing) {
      return { available: true, error: null }
    }
    
    // Generate suggestion
    let suggestion = subdomain
    let attempts = 1
    while (attempts <= 5) {
      const testSubdomain = `${subdomain}-${attempts}`
      const { data: existingTest } = await supabaseAdmin
        .from('sites')
        .select('id')
        .eq('subdomain', testSubdomain)
        .single()
      
      if (!existingTest) {
        suggestion = testSubdomain
        break
      }
      attempts++
    }
    
    return { available: false, suggestion, error: null }
  } catch (error) {
    // Error checking subdomain availability
    return { 
      available: false, 
      error: `Server error: ${error instanceof Error ? error.message : String(error)}` 
    }
  }
}

/**
 * Helper function to update site public pages settings (navigation or footer)
 */
async function updateSitePublicPagesField(
  siteId: string,
  fieldName: 'navigation' | 'footer',
  data: Record<string, any>
): Promise<{ success: boolean; error: string | null }> {
  try {
    // Verify user is authenticated
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return { success: false, error: 'Authentication required' }
    }

    // Verify user owns this site
    const { data: site, error: siteError } = await supabaseAdmin
      .from('sites')
      .select('id, user_id')
      .eq('id', siteId)
      .eq('user_id', user.id)
      .single()

    if (siteError || !site) {
      return { success: false, error: 'Site not found or access denied' }
    }

    // Get current settings
    const { data: currentSite, error: fetchError } = await supabaseAdmin
      .from('sites')
      .select('settings')
      .eq('id', siteId)
      .single()

    if (fetchError) {
      return { success: false, error: `Failed to fetch site settings: ${fetchError.message}` }
    }

    // Update field in settings under public_pages
    const publicPages = { ...(currentSite.settings?.public_pages || {}) }
    if (data === null || data === undefined) {
      delete publicPages[fieldName]
    } else {
      publicPages[fieldName] = data
    }
    const updatedSettings = {
      ...currentSite.settings,
      public_pages: publicPages
    }

    const { error } = await supabaseAdmin
      .from('sites')
      .update({ settings: updatedSettings })
      .eq('id', siteId)

    if (error) {
      return { success: false, error: `Failed to update ${fieldName}: ${error.message}` }
    }

    // Invalidate cached site data so changes take effect immediately
    revalidateTag('site-lookup')
    revalidateTag('all')
    revalidatePath('/', 'layout')

    return { success: true, error: null }
  } catch (error) {
    return {
      success: false,
      error: `Server error: ${error instanceof Error ? error.message : String(error)}`
    }
  }
}

/**
 * Update site navigation data
 */
export async function updateSiteNavigationAction(siteId: string, navigationData: Record<string, any>): Promise<{ success: boolean; error: string | null }> {
  return updateSitePublicPagesField(siteId, 'navigation', navigationData)
}

/**
 * Update site footer data
 */
export async function updateSiteFooterAction(siteId: string, footerData: Record<string, any>): Promise<{ success: boolean; error: string | null }> {
  return updateSitePublicPagesField(siteId, 'footer', footerData)
}

