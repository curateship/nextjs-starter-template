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
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  )
}

export interface Site {
  id: string
  user_id: string
  theme_id: string
  name: string
  description: string | null
  subdomain: string
  custom_domain: string | null
  status: 'active' | 'inactive' | 'draft' | 'suspended'
  settings: Record<string, any>
  created_at: string
  updated_at: string
}

export interface SiteWithTheme extends Site {
  theme_name: string
  theme_description: string | null
  template_path: string
  preview_image: string | null
  theme_metadata: Record<string, any>
}

export interface CreateSiteData {
  name: string
  description?: string
  theme_id: string
  status?: 'active' | 'inactive' | 'draft'
  settings?: Record<string, any>
}

export async function getAllSitesAction(): Promise<{ data: SiteWithTheme[] | null; error: string | null }> {
  try {
    // Server action: Fetching all sites with theme info
    
    const { data, error } = await supabaseAdmin
      .from('site_details')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      // Database error fetching sites
      return { data: null, error: `Database error: ${error.message}` }
    }

    // Successfully fetched sites
    return { data: data as SiteWithTheme[], error: null }
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
    // Creating new site
    
    // Generate unique subdomain if not provided
    let subdomain = siteData.name.toLowerCase()
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
    
    // Get theme ID - use provided theme or default to active Marketplace theme
    let themeId = siteData.theme_id
    
    if (!themeId) {
      const { data: defaultTheme } = await supabaseAdmin
        .from('themes')
        .select('id')
        .eq('status', 'active')
        .eq('name', 'Marketplace')
        .single()
      
      if (defaultTheme) {
        themeId = defaultTheme.id
      }
    }
    
    if (!themeId) {
      return { data: null, error: 'No theme selected and no default theme available' }
    }
    
    // Validate theme exists and is active
    const { data: theme, error: themeError } = await supabaseAdmin
      .from('themes')
      .select('id, status')
      .eq('id', themeId)
      .single()

    if (themeError || !theme) {
      return { data: null, error: 'Selected theme not found' }
    }

    if (theme.status !== 'active') {
      return { data: null, error: 'Selected theme is not active' }
    }

    // Get the authenticated user's ID from the session
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return { data: null, error: 'User not authenticated. Please log in first.' }
    }
    
    const actualUserId = user.id
    // Creating site for authenticated user

    // Create the site
    const { data, error } = await supabaseAdmin
      .from('sites')
      .insert([{
        name: siteData.name,
        description: siteData.description || null,
        theme_id: themeId,
        user_id: actualUserId,
        subdomain,
        status: siteData.status || 'draft',
        settings: siteData.settings || {
          site_title: siteData.name,
          site_description: siteData.description || '',
          analytics_enabled: false,
          seo_enabled: true
        }
      }])
      .select()
      .single()

    if (error) {
      // Database error creating site
      return { data: null, error: `Failed to create site: ${error.message}` }
    }

    // Copy theme blocks to site blocks for the new site
    const { error: copyError } = await supabaseAdmin
      .rpc('copy_theme_blocks_to_site', {
        p_site_id: data.id,
        p_theme_id: themeId
      })

    if (copyError) {
      // Log error but don't fail site creation
      console.error('Failed to copy theme blocks:', copyError.message)
    }

    // Successfully created site
    return { data: data as Site, error: null }
  } catch (error) {
    // Unexpected error creating site
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
    // Updating site
    
    // If updating theme, validate it exists and is active
    if (updates.theme_id) {
      const { data: theme, error: themeError } = await supabaseAdmin
        .from('themes')
        .select('id, status')
        .eq('id', updates.theme_id)
        .single()

      if (themeError || !theme) {
        return { data: null, error: 'Selected theme not found' }
      }

      if (theme.status !== 'active') {
        return { data: null, error: 'Selected theme is not active' }
      }
    }
    
    const { data, error } = await supabaseAdmin
      .from('sites')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', siteId)
      .select()
      .single()

    if (error) {
      // Database error updating site
      return { data: null, error: `Failed to update site: ${error.message}` }
    }

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
    // Deleting site
    
    // Delete site (this will cascade delete customizations due to foreign key constraints)
    const { error } = await supabaseAdmin
      .from('sites')
      .delete()
      .eq('id', siteId)

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

export async function getSiteByIdAction(siteId: string): Promise<{ data: SiteWithTheme | null; error: string | null }> {
  try {
    const { data, error } = await supabaseAdmin
      .from('site_details')
      .select('*')
      .eq('id', siteId)
      .single()

    if (error) {
      // Database error fetching site
      return { data: null, error: `Failed to fetch site: ${error.message}` }
    }

    return { data: data as SiteWithTheme, error: null }
  } catch (error) {
    // Unexpected error fetching site
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

