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

export interface Page {
  id: string
  site_id: string
  title: string
  slug: string
  meta_description: string | null
  meta_keywords: string | null
  is_homepage: boolean
  is_published: boolean
  display_order: number
  created_at: string
  updated_at: string
}

export interface PageWithDetails extends Page {
  site_name: string
  subdomain: string
  user_id: string
  block_count: number
}

export interface CreatePageData {
  title: string
  slug?: string
  meta_description?: string
  meta_keywords?: string
  is_homepage?: boolean
  is_published?: boolean
}

export interface UpdatePageData {
  title?: string
  slug?: string
  meta_description?: string
  meta_keywords?: string
  is_homepage?: boolean
  is_published?: boolean
}

/**
 * Get all pages for a site
 */
export async function getSitePagesAction(siteId: string): Promise<{ data: Page[] | null; error: string | null }> {
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
      .from('pages')
      .select('*')
      .eq('site_id', siteId)
      .order('display_order', { ascending: true })

    if (error) {
      // Check if it's a table not found error
      if (error.message.includes('relation') && error.message.includes('does not exist')) {
        // Pages table doesn't exist yet - return mock data for now
        return {
          data: [
            {
              id: '00000000-0000-0000-0000-000000000001',
              site_id: siteId,
              title: 'Home',
              slug: 'home',
              meta_description: 'Welcome to our website',
              meta_keywords: null,
              template: 'default' as const,
              is_homepage: true,
              is_published: true,
              display_order: 1,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            },
            {
              id: '00000000-0000-0000-0000-000000000002',
              site_id: siteId,
              title: 'About',
              slug: 'about',
              meta_description: 'Learn more about us',
              meta_keywords: null,
              template: 'default' as const,
              is_homepage: false,
              is_published: true,
              display_order: 2,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            },
            {
              id: '00000000-0000-0000-0000-000000000003',
              site_id: siteId,
              title: 'Contact',
              slug: 'contact',
              meta_description: 'Get in touch with us',
              meta_keywords: null,
              template: 'default' as const,
              is_homepage: false,
              is_published: true,
              display_order: 3,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            }
          ],
          error: null
        }
      }
      return { data: null, error: `Failed to fetch pages: ${error.message}` }
    }

    return { data: data as Page[], error: null }
  } catch (error) {
    return { 
      data: null, 
      error: `Server error: ${error instanceof Error ? error.message : String(error)}` 
    }
  }
}

/**
 * Get a single page by ID
 */
export async function getPageByIdAction(pageId: string): Promise<{ data: Page | null; error: string | null }> {
  try {
    // Validate page ID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(pageId)) {
      return { data: null, error: 'Invalid page ID format' }
    }

    // Get the authenticated user's ID from the session
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return { data: null, error: 'User not authenticated. Please log in first.' }
    }

    // First get the page to check which site it belongs to
    const { data: page, error: pageError } = await supabaseAdmin
      .from('pages')
      .select('*')
      .eq('id', pageId)
      .single()

    if (pageError) {
      // Check if it's a table not found error
      if (pageError.message.includes('relation') && pageError.message.includes('does not exist')) {
        // Pages table doesn't exist yet - return mock data for now
        return {
          data: {
            id: pageId,
            site_id: 'mock-site-id',
            title: 'Sample Page',
            slug: 'sample-page',
            meta_description: 'This is a sample page',
            meta_keywords: '',
            template: 'default' as const,
            is_homepage: false,
            is_published: true,
            display_order: 1,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          },
          error: null
        }
      }
      
      // Page not found - this is expected if the page doesn't exist yet
      if (pageError.code === 'PGRST116') {
        return { data: null, error: 'Page not found. The database migration may not have created default pages yet.' }
      }
      
      return { data: null, error: `Failed to fetch page: ${pageError.message}` }
    }

    if (!page) {
      return { data: null, error: 'Page not found' }
    }
    

    // Now verify the user owns the site this page belongs to
    const { data: site, error: siteError } = await supabaseAdmin
      .from('sites')
      .select('id, user_id')
      .eq('id', page.site_id)
      .eq('user_id', user.id)
      .single()

    if (siteError || !site) {
      return { data: null, error: 'Site not found or access denied' }
    }

    // Ensure all dates are properly serialized
    const serializedPage = {
      ...page,
      created_at: page.created_at ? new Date(page.created_at).toISOString() : new Date().toISOString(),
      updated_at: page.updated_at ? new Date(page.updated_at).toISOString() : new Date().toISOString()
    }
    
    return { data: serializedPage, error: null }
  } catch (error) {
    return { 
      data: null, 
      error: `Server error: ${error instanceof Error ? error.message : String(error)}` 
    }
  }
}

/**
 * Create a new page for a site
 */
export async function createPageAction(siteId: string, pageData: CreatePageData): Promise<{ data: Page | null; error: string | null }> {
  try {
    // Validate site ID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(siteId)) {
      return { data: null, error: 'Invalid site ID format' }
    }

    // Validate required fields
    if (!pageData.title?.trim()) {
      return { data: null, error: 'Page title is required' }
    }

    // Get the authenticated user's ID from the session
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

    // Generate slug from title if not provided
    let slug = pageData.slug
    if (!slug) {
      slug = pageData.title
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
    }

    // Validate slug format
    if (!/^[a-zA-Z0-9_-]+$/.test(slug)) {
      return { data: null, error: 'Invalid slug format. Use only letters, numbers, hyphens, and underscores.' }
    }

    // Check for reserved slugs
    const reservedSlugs = ['api', 'admin', 'www', 'mail', 'ftp', 'global']
    if (reservedSlugs.includes(slug.toLowerCase())) {
      return { data: null, error: 'This slug is reserved and cannot be used.' }
    }

    // Check if slug already exists for this site
    const { data: existingPage, error: slugCheckError } = await supabaseAdmin
      .from('pages')
      .select('id')
      .eq('site_id', siteId)
      .eq('slug', slug)
      .single()

    if (slugCheckError && slugCheckError.code !== 'PGRST116') {
      return { data: null, error: 'Failed to validate slug uniqueness' }
    }

    if (existingPage) {
      return { data: null, error: 'A page with this slug already exists' }
    }

    // If setting as homepage, unset any existing homepage
    if (pageData.is_homepage) {
      await supabaseAdmin
        .from('pages')
        .update({ is_homepage: false })
        .eq('site_id', siteId)
        .eq('is_homepage', true)
    }

    // Get the next display order
    const { data: orderData } = await supabaseAdmin
      .from('pages')
      .select('display_order')
      .eq('site_id', siteId)
      .order('display_order', { ascending: false })
      .limit(1)

    const nextOrder = orderData && orderData.length > 0 ? orderData[0].display_order + 1 : 1

    // Create the page
    const { data, error } = await supabaseAdmin
      .from('pages')
      .insert([{
        site_id: siteId,
        title: pageData.title.trim(),
        slug,
        meta_description: pageData.meta_description?.trim() || null,
        meta_keywords: pageData.meta_keywords?.trim() || null,
        is_homepage: pageData.is_homepage || false,
        is_published: pageData.is_published !== false,
        display_order: nextOrder
      }])
      .select()
      .single()

    if (error) {
      return { data: null, error: `Failed to create page: ${error.message}` }
    }

    return { data: data as Page, error: null }
  } catch (error) {
    return { 
      data: null, 
      error: `Server error: ${error instanceof Error ? error.message : String(error)}` 
    }
  }
}

/**
 * Update an existing page
 */
export async function updatePageAction(pageId: string, updates: UpdatePageData): Promise<{ data: Page | null; error: string | null }> {
  try {
    // Validate page ID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(pageId)) {
      return { data: null, error: 'Invalid page ID format' }
    }

    // Get the authenticated user's ID from the session
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return { data: null, error: 'User not authenticated. Please log in first.' }
    }

    // Get the page
    const { data: page, error: pageError } = await supabaseAdmin
      .from('pages')
      .select('*')
      .eq('id', pageId)
      .single()

    if (pageError || !page) {
      return { data: null, error: 'Page not found' }
    }

    // Verify user owns the site this page belongs to
    const { data: site, error: siteError } = await supabaseAdmin
      .from('sites')
      .select('id, user_id')
      .eq('id', page.site_id)
      .eq('user_id', user.id)
      .single()

    if (siteError || !site) {
      return { data: null, error: 'Site not found or access denied' }
    }

    // Validate title if being updated
    if (updates.title !== undefined && !updates.title?.trim()) {
      return { data: null, error: 'Page title cannot be empty' }
    }

    // Validate and process slug if being updated
    let processedUpdates = { ...updates }
    if (updates.slug !== undefined) {
      const slug = updates.slug.trim()
      
      // Validate slug format
      if (!/^[a-zA-Z0-9_-]+$/.test(slug)) {
        return { data: null, error: 'Invalid slug format. Use only letters, numbers, hyphens, and underscores.' }
      }

      // Check for reserved slugs
      const reservedSlugs = ['api', 'admin', 'www', 'mail', 'ftp', 'global']
      if (reservedSlugs.includes(slug.toLowerCase())) {
        return { data: null, error: 'This slug is reserved and cannot be used.' }
      }

      // Check if slug already exists for this site (excluding current page)
      const { data: existingPage } = await supabaseAdmin
        .from('pages')
        .select('id')
        .eq('site_id', page.site_id)
        .eq('slug', slug)
        .neq('id', pageId)
        .single()

      if (existingPage) {
        return { data: null, error: 'A page with this slug already exists' }
      }

      processedUpdates.slug = slug
    }

    // If setting as homepage, unset any existing homepage
    if (updates.is_homepage === true) {
      await supabaseAdmin
        .from('pages')
        .update({ is_homepage: false })
        .eq('site_id', page.site_id)
        .eq('is_homepage', true)
        .neq('id', pageId)
    }

    // Clean up the updates object
    const finalUpdates: any = {}
    Object.entries(processedUpdates).forEach(([key, value]) => {
      if (value !== undefined) {
        if (key === 'title' || key === 'meta_description' || key === 'meta_keywords') {
          finalUpdates[key] = typeof value === 'string' ? value.trim() || null : value
        } else {
          finalUpdates[key] = value
        }
      }
    })

    // Update the page
    const { data, error } = await supabaseAdmin
      .from('pages')
      .update({
        ...finalUpdates,
        updated_at: new Date().toISOString()
      })
      .eq('id', pageId)
      .select()
      .single()

    if (error) {
      return { data: null, error: `Failed to update page: ${error.message}` }
    }

    return { data: data as Page, error: null }
  } catch (error) {
    return { 
      data: null, 
      error: `Server error: ${error instanceof Error ? error.message : String(error)}` 
    }
  }
}

/**
 * Delete a page
 */
export async function deletePageAction(pageId: string): Promise<{ success: boolean; error: string | null }> {
  try {
    // Validate page ID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(pageId)) {
      return { success: false, error: 'Invalid page ID format' }
    }

    // Get the authenticated user's ID from the session
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return { success: false, error: 'User not authenticated. Please log in first.' }
    }

    // Get the page
    const { data: page, error: pageError } = await supabaseAdmin
      .from('pages')
      .select('*')
      .eq('id', pageId)
      .single()

    if (pageError || !page) {
      return { success: false, error: 'Page not found' }
    }

    // Verify user owns the site this page belongs to
    const { data: site, error: siteError } = await supabaseAdmin
      .from('sites')
      .select('id, user_id')
      .eq('id', page.site_id)
      .eq('user_id', user.id)
      .single()

    if (siteError || !site) {
      return { success: false, error: 'Site not found or access denied' }
    }

    // Check if page has blocks
    const { count: blockCount } = await supabaseAdmin
      .from('site_blocks')
      .select('id', { count: 'exact', head: true })
      .eq('site_id', page.site_id)
      .eq('page_slug', page.slug)

    // Prevent deleting homepage
    if (page.is_homepage) {
      return { success: false, error: 'Cannot delete the homepage. Set another page as homepage first.' }
    }

    // Check if page has blocks
    if (blockCount && blockCount > 0) {
      return { success: false, error: 'Cannot delete page that contains blocks. Remove all blocks first.' }
    }

    // Delete the page
    const { error } = await supabaseAdmin
      .from('pages')
      .delete()
      .eq('id', pageId)

    if (error) {
      return { success: false, error: `Failed to delete page: ${error.message}` }
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
 * Duplicate a page
 */
export async function duplicatePageAction(pageId: string, newTitle: string): Promise<{ data: Page | null; error: string | null }> {
  try {
    // Validate page ID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(pageId)) {
      return { data: null, error: 'Invalid page ID format' }
    }

    if (!newTitle?.trim()) {
      return { data: null, error: 'New page title is required' }
    }

    // Get the authenticated user's ID from the session
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return { data: null, error: 'User not authenticated. Please log in first.' }
    }

    // Get the original page
    const { data: originalPage, error: pageError } = await supabaseAdmin
      .from('pages')
      .select('*')
      .eq('id', pageId)
      .single()

    if (pageError || !originalPage) {
      return { data: null, error: 'Page not found' }
    }

    // Verify user owns the site this page belongs to
    const { data: site, error: siteError } = await supabaseAdmin
      .from('sites')
      .select('id, user_id')
      .eq('id', originalPage.site_id)
      .eq('user_id', user.id)
      .single()

    if (siteError || !site) {
      return { data: null, error: 'Site not found or access denied' }
    }

    // Generate new slug
    const baseSlug = newTitle
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')

    let newSlug = baseSlug
    let counter = 1

    // Ensure unique slug
    while (true) {
      const { data: existingPage } = await supabaseAdmin
        .from('pages')
        .select('id')
        .eq('site_id', originalPage.site_id)
        .eq('slug', newSlug)
        .single()

      if (!existingPage) break

      newSlug = `${baseSlug}-${counter}`
      counter++
    }

    // Get the next display order
    const { data: orderData } = await supabaseAdmin
      .from('pages')
      .select('display_order')
      .eq('site_id', originalPage.site_id)
      .order('display_order', { ascending: false })
      .limit(1)

    const nextOrder = orderData && orderData.length > 0 ? orderData[0].display_order + 1 : 1

    // Create the duplicate page
    const { data: newPage, error } = await supabaseAdmin
      .from('pages')
      .insert([{
        site_id: originalPage.site_id,
        title: newTitle.trim(),
        slug: newSlug,
        meta_description: originalPage.meta_description,
        meta_keywords: originalPage.meta_keywords,
        is_homepage: false, // Never duplicate as homepage
        is_published: originalPage.is_published,
        display_order: nextOrder
      }])
      .select()
      .single()

    if (error) {
      return { data: null, error: `Failed to duplicate page: ${error.message}` }
    }

    // Copy all blocks from the original page to the new page
    const { data: originalBlocks } = await supabaseAdmin
      .from('site_blocks')
      .select('*')
      .eq('site_id', originalPage.site_id)
      .eq('page_slug', originalPage.slug)
      .eq('is_active', true)

    if (originalBlocks && originalBlocks.length > 0) {
      const duplicatedBlocks = originalBlocks.map(block => ({
        site_id: block.site_id,
        block_type: block.block_type,
        page_slug: newSlug,
        content: block.content,
        display_order: block.display_order,
        is_active: true
      }))

      await supabaseAdmin
        .from('site_blocks')
        .insert(duplicatedBlocks)
    }

    return { data: newPage as Page, error: null }
  } catch (error) {
    return { 
      data: null, 
      error: `Server error: ${error instanceof Error ? error.message : String(error)}` 
    }
  }
}