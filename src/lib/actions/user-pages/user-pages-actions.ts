'use server'

import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { revalidateTag, unstable_cache } from 'next/cache'

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

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

export interface UserPage {
  id: string
  site_id: string
  title: string
  slug: string
  meta_description: string | null
  content_blocks: Record<string, any>
  display_order: number
  is_default: boolean
  is_published: boolean
  created_at: string
  updated_at: string
}

export interface CreateUserPageData {
  title: string
  slug?: string
  meta_description?: string
  is_default?: boolean
  is_published?: boolean
  content_blocks?: Record<string, any>
}

export interface UpdateUserPageData {
  title?: string
  slug?: string
  meta_description?: string
  is_default?: boolean
  is_published?: boolean
}

// =============================================================================
// USER PAGES SETTINGS ACTIONS (stored in sites.settings.user_pages)
// =============================================================================

/**
 * Update user pages navigation/footer settings in sites.settings.user_pages
 */
export async function updateUserPagesSettingsAction(
  siteId: string,
  settings: { navigation?: any; footer?: any }
): Promise<{ success: boolean; error: string | null }> {
  try {
    // Get the authenticated user's ID from the session
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return { success: false, error: 'Authentication required' }
    }

    // Get current site settings and verify ownership
    const { data: site, error: fetchError } = await supabaseAdmin
      .from('sites')
      .select('settings')
      .eq('id', siteId)
      .eq('user_id', user.id)
      .single()

    if (fetchError || !site) {
      return { success: false, error: 'Site not found or access denied' }
    }

    // Build updated settings
    const currentSettings = site.settings || {}
    const userPagesSettings = currentSettings.user_pages || {}

    const updatedSettings = {
      ...currentSettings,
      user_pages: {
        ...userPagesSettings,
        ...(settings.navigation !== undefined && { navigation: settings.navigation }),
        ...(settings.footer !== undefined && { footer: settings.footer })
      }
    }

    // Update sites table
    const { error: updateError } = await supabaseAdmin
      .from('sites')
      .update({ settings: updatedSettings })
      .eq('id', siteId)

    if (updateError) {
      console.error('Error updating user pages settings:', updateError)
      return { success: false, error: updateError.message }
    }

    // Revalidate cache
    revalidateTag(`site-${siteId}`)
    revalidateTag(`user-pages-${siteId}`)

    return { success: true, error: null }
  } catch (error: any) {
    console.error('Exception in updateUserPagesSettingsAction:', error)
    return { success: false, error: error.message || 'Failed to update user pages settings' }
  }
}

// =============================================================================
// USER PAGES ACTIONS
// =============================================================================

/**
 * Get all user pages for a site
 */
export async function getUserPagesAction(siteId: string): Promise<{ data: UserPage[] | null; error: string | null }> {
  try {
    // Validate site ID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(siteId)) {
      return { data: null, error: 'Invalid site ID format' }
    }

    // Get the authenticated user's ID from the session
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return { data: null, error: 'Authentication required' }
    }

    // Verify user owns this site
    const { data: site } = await supabaseAdmin
      .from('sites')
      .select('id')
      .eq('id', siteId)
      .eq('user_id', user.id)
      .single()

    if (!site) {
      return { data: null, error: 'Access denied' }
    }

    // Use admin client to fetch all pages
    const { data, error } = await supabaseAdmin
      .from('users_pages')
      .select('*')
      .eq('site_id', siteId)
      .order('display_order', { ascending: true })

    if (error) {
      console.error('Error fetching user pages:', error)
      return { data: null, error: error.message }
    }

    return { data: data || [], error: null }
  } catch (error: any) {
    console.error('Exception in getUserPagesAction:', error)
    return { data: null, error: error.message || 'Failed to fetch user pages' }
  }
}

/**
 * Get a single user page by ID
 */
export async function getUserPageAction(pageId: string): Promise<{ data: UserPage | null; error: string | null }> {
  try {
    // Get the authenticated user's ID from the session
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return { data: null, error: 'Authentication required' }
    }

    const { data, error } = await supabaseAdmin
      .from('users_pages')
      .select('*')
      .eq('id', pageId)
      .single()

    if (error) {
      console.error('Error fetching user page:', error)
      return { data: null, error: error.message }
    }

    // Verify user owns the site this page belongs to
    const { data: site } = await supabaseAdmin
      .from('sites')
      .select('id')
      .eq('id', data.site_id)
      .eq('user_id', user.id)
      .single()

    if (!site) {
      return { data: null, error: 'Access denied' }
    }

    return { data, error: null }
  } catch (error: any) {
    console.error('Exception in getUserPageAction:', error)
    return { data: null, error: error.message || 'Failed to fetch user page' }
  }
}

/**
 * Create a new user page
 */
export async function createUserPageAction(
  siteId: string,
  pageData: CreateUserPageData
): Promise<{ data: UserPage | null; error: string | null }> {
  try {
    // Get the authenticated user's ID from the session
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return { data: null, error: 'Authentication required' }
    }

    // Verify user owns this site
    const { data: site } = await supabaseAdmin
      .from('sites')
      .select('id')
      .eq('id', siteId)
      .eq('user_id', user.id)
      .single()

    if (!site) {
      return { data: null, error: 'Access denied' }
    }

    // Generate slug from title if not provided
    const slug = pageData.slug || pageData.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')

    // Get the highest display_order for this site to append new page at the end
    const { data: existingPages } = await supabaseAdmin
      .from('users_pages')
      .select('display_order')
      .eq('site_id', siteId)
      .order('display_order', { ascending: false })
      .limit(1)

    const nextOrder = existingPages && existingPages.length > 0
      ? existingPages[0].display_order + 1
      : 1

    const { data, error } = await supabaseAdmin
      .from('users_pages')
      .insert({
        site_id: siteId,
        title: pageData.title,
        slug,
        meta_description: pageData.meta_description || null,
        is_default: pageData.is_default || false,
        is_published: pageData.is_published !== false,
        content_blocks: pageData.content_blocks || {},
        display_order: nextOrder
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating user page:', error)
      return { data: null, error: error.message }
    }

    // Revalidate cache
    revalidateTag(`user-pages-${siteId}`)

    return { data, error: null }
  } catch (error: any) {
    console.error('Exception in createUserPageAction:', error)
    return { data: null, error: error.message || 'Failed to create user page' }
  }
}

/**
 * Update a user page
 */
export async function updateUserPageAction(
  pageId: string,
  pageData: UpdateUserPageData
): Promise<{ data: UserPage | null; error: string | null }> {
  try {
    // Get the authenticated user's ID from the session
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return { data: null, error: 'Authentication required' }
    }

    // Fetch page to verify ownership
    const { data: existingPage, error: fetchError } = await supabaseAdmin
      .from('users_pages')
      .select('site_id')
      .eq('id', pageId)
      .single()

    if (fetchError || !existingPage) {
      return { data: null, error: 'Page not found' }
    }

    // Verify user owns the site this page belongs to
    const { data: site } = await supabaseAdmin
      .from('sites')
      .select('id')
      .eq('id', existingPage.site_id)
      .eq('user_id', user.id)
      .single()

    if (!site) {
      return { data: null, error: 'Access denied' }
    }

    // Whitelist allowed fields
    const allowedUpdates: Record<string, any> = {}
    if (pageData.title !== undefined) allowedUpdates.title = pageData.title
    if (pageData.slug !== undefined) allowedUpdates.slug = pageData.slug
    if (pageData.meta_description !== undefined) allowedUpdates.meta_description = pageData.meta_description
    if (pageData.is_default !== undefined) allowedUpdates.is_default = pageData.is_default
    if (pageData.is_published !== undefined) allowedUpdates.is_published = pageData.is_published

    const { data, error } = await supabaseAdmin
      .from('users_pages')
      .update(allowedUpdates)
      .eq('id', pageId)
      .select()
      .single()

    if (error) {
      console.error('Error updating user page:', error)
      return { data: null, error: error.message }
    }

    // Revalidate cache
    revalidateTag(`user-page-${pageId}`)
    revalidateTag(`user-pages-${data.site_id}`)

    return { data, error: null }
  } catch (error: any) {
    console.error('Exception in updateUserPageAction:', error)
    return { data: null, error: error.message || 'Failed to update user page' }
  }
}

/**
 * Delete a user page
 */
export async function deleteUserPageAction(pageId: string): Promise<{ success: boolean; error: string | null }> {
  try {
    // Get the authenticated user's ID from the session
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return { success: false, error: 'Authentication required' }
    }

    // Get page to verify ownership and find site_id for cache revalidation
    const { data: page } = await supabaseAdmin
      .from('users_pages')
      .select('site_id')
      .eq('id', pageId)
      .single()

    if (!page) {
      return { success: false, error: 'Page not found' }
    }

    // Verify user owns the site this page belongs to
    const { data: site } = await supabaseAdmin
      .from('sites')
      .select('id')
      .eq('id', page.site_id)
      .eq('user_id', user.id)
      .single()

    if (!site) {
      return { success: false, error: 'Access denied' }
    }

    const { error } = await supabaseAdmin
      .from('users_pages')
      .delete()
      .eq('id', pageId)

    if (error) {
      console.error('Error deleting user page:', error)
      return { success: false, error: error.message }
    }

    // Revalidate cache
    if (page) {
      revalidateTag(`user-pages-${page.site_id}`)
    }
    revalidateTag(`user-page-${pageId}`)

    return { success: true, error: null }
  } catch (error: any) {
    console.error('Exception in deleteUserPageAction:', error)
    return { success: false, error: error.message || 'Failed to delete user page' }
  }
}

/**
 * Update user page content blocks
 */
export async function updateUserPageBlocksAction(
  pageId: string,
  contentBlocks: Record<string, any>
): Promise<{ data: UserPage | null; error: string | null }> {
  try {
    // Get the authenticated user's ID from the session
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return { data: null, error: 'Authentication required' }
    }

    // Fetch page to verify ownership
    const { data: existingPage, error: fetchError } = await supabaseAdmin
      .from('users_pages')
      .select('site_id')
      .eq('id', pageId)
      .single()

    if (fetchError || !existingPage) {
      return { data: null, error: 'Page not found' }
    }

    // Verify user owns the site this page belongs to
    const { data: site } = await supabaseAdmin
      .from('sites')
      .select('id')
      .eq('id', existingPage.site_id)
      .eq('user_id', user.id)
      .single()

    if (!site) {
      return { data: null, error: 'Access denied' }
    }

    const { data, error } = await supabaseAdmin
      .from('users_pages')
      .update({ content_blocks: contentBlocks })
      .eq('id', pageId)
      .select()
      .single()

    if (error) {
      console.error('Error updating user page blocks:', error)
      return { data: null, error: error.message }
    }

    // Revalidate cache
    revalidateTag(`user-page-${pageId}`)
    revalidateTag(`user-pages-${data.site_id}`)

    return { data, error: null }
  } catch (error: any) {
    console.error('Exception in updateUserPageBlocksAction:', error)
    return { data: null, error: error.message || 'Failed to update user page blocks' }
  }
}

/**
 * Reorder user pages
 */
export async function reorderUserPagesAction(
  pageUpdates: Array<{ id: string; display_order: number }>
): Promise<{ success: boolean; error: string | null }> {
  try {
    // Get the authenticated user's ID from the session
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return { success: false, error: 'Authentication required' }
    }

    // Verify ownership via first page
    if (pageUpdates.length > 0) {
      const { data: firstPage } = await supabaseAdmin
        .from('users_pages')
        .select('site_id')
        .eq('id', pageUpdates[0].id)
        .single()

      if (!firstPage) {
        return { success: false, error: 'Page not found' }
      }

      const { data: site } = await supabaseAdmin
        .from('sites')
        .select('id')
        .eq('id', firstPage.site_id)
        .eq('user_id', user.id)
        .single()

      if (!site) {
        return { success: false, error: 'Access denied' }
      }
    }

    // Update each page's display_order
    for (const update of pageUpdates) {
      const { error } = await supabaseAdmin
        .from('users_pages')
        .update({ display_order: update.display_order })
        .eq('id', update.id)

      if (error) {
        console.error('Error reordering user pages:', error)
        return { success: false, error: error.message }
      }
    }

    // Get site_id for cache revalidation
    if (pageUpdates.length > 0) {
      const { data: page } = await supabaseAdmin
        .from('users_pages')
        .select('site_id')
        .eq('id', pageUpdates[0].id)
        .single()

      if (page) {
        revalidateTag(`user-pages-${page.site_id}`)
      }
    }

    return { success: true, error: null }
  } catch (error: any) {
    console.error('Exception in reorderUserPagesAction:', error)
    return { success: false, error: error.message || 'Failed to reorder user pages' }
  }
}

/**
 * Duplicate a user page
 */
export async function duplicateUserPageAction(
  pageId: string,
  newTitle: string
): Promise<{ data: UserPage | null; error: string | null }> {
  try {
    // Get the authenticated user's ID from the session
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return { data: null, error: 'Authentication required' }
    }

    // Get the original page
    const { data: originalPage, error: fetchError } = await supabaseAdmin
      .from('users_pages')
      .select('*')
      .eq('id', pageId)
      .single()

    if (fetchError || !originalPage) {
      console.error('Error fetching original page:', fetchError)
      return { data: null, error: fetchError?.message || 'Original page not found' }
    }

    // Verify user owns the site this page belongs to
    const { data: site } = await supabaseAdmin
      .from('sites')
      .select('id')
      .eq('id', originalPage.site_id)
      .eq('user_id', user.id)
      .single()

    if (!site) {
      return { data: null, error: 'Access denied' }
    }

    // Generate unique slug from new title
    const baseSlug = newTitle
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')

    // Check for existing slugs and append number if needed
    const { data: existingPages } = await supabaseAdmin
      .from('users_pages')
      .select('slug')
      .eq('site_id', originalPage.site_id)
      .like('slug', `${baseSlug}%`)

    let slug = baseSlug
    if (existingPages && existingPages.length > 0) {
      const existingSlugs = existingPages.map(p => p.slug)
      let counter = 1
      while (existingSlugs.includes(slug)) {
        slug = `${baseSlug}-${counter}`
        counter++
      }
    }

    // Get the highest display_order to append at the end
    const { data: lastPage } = await supabaseAdmin
      .from('users_pages')
      .select('display_order')
      .eq('site_id', originalPage.site_id)
      .order('display_order', { ascending: false })
      .limit(1)

    const nextOrder = lastPage && lastPage.length > 0
      ? lastPage[0].display_order + 1
      : 1

    // Create the duplicate
    const { data, error } = await supabaseAdmin
      .from('users_pages')
      .insert({
        site_id: originalPage.site_id,
        title: newTitle,
        slug,
        meta_description: originalPage.meta_description,
        is_default: false, // Duplicate is never default
        is_published: false, // Start as draft
        content_blocks: originalPage.content_blocks,
        display_order: nextOrder
      })
      .select()
      .single()

    if (error) {
      console.error('Error duplicating user page:', error)
      return { data: null, error: error.message }
    }

    // Revalidate cache
    revalidateTag(`user-pages-${originalPage.site_id}`)

    return { data, error: null }
  } catch (error: any) {
    console.error('Exception in duplicateUserPageAction:', error)
    return { data: null, error: error.message || 'Failed to duplicate user page' }
  }
}
