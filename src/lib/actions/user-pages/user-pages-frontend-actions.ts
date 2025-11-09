'use server'

import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { unstable_cache } from 'next/cache'

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

// Types for blocks
interface Block {
  id: string
  type: string
  content: Record<string, any>
  display_order: number
}

export interface SiteWithUserPageBlocks {
  id: string
  name: string
  subdomain: string
  custom_domain: string | null
  settings?: {
    favicon?: string
    user_pages?: {
      navigation?: any
      footer?: any
    }
    [key: string]: any
  }
  blocks: Block[]
  currentPage?: {
    id: string
    title: string
    slug: string
    meta_description: string | null
  }
}

/**
 * Helper function to build blocks array with navigation, page content, and footer
 */
function buildUserPageBlocks(
  site: any,
  page: { content_blocks: Record<string, any> }
): Block[] {
  const blocks: Block[] = []

  // Add navigation from site settings
  if (site.settings?.user_pages?.navigation) {
    blocks.push({
      id: 'user-navigation',
      type: 'navigation',
      content: site.settings.user_pages.navigation,
      display_order: -1
    })
  }

  // Add page blocks from content_blocks
  if (page.content_blocks) {
    Object.entries(page.content_blocks).forEach(([blockId, blockData]: [string, any]) => {
      blocks.push({
        id: blockId,
        type: blockData.type,
        content: blockData.content || blockData,
        display_order: blockData.display_order || 0
      })
    })
  }

  // Add footer from site settings
  if (site.settings?.user_pages?.footer) {
    blocks.push({
      id: 'user-footer',
      type: 'footer',
      content: site.settings.user_pages.footer,
      display_order: 999
    })
  }

  return blocks
}

/**
 * Get user page by slug for frontend rendering
 */
export async function getUserPageBySlug(
  siteId: string,
  slug: string
): Promise<{ data: SiteWithUserPageBlocks | null; error: string | null }> {
  try {
    // Get the authenticated user
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return { data: null, error: 'Authentication required' }
    }

    // Fetch site data
    const { data: site, error: siteError } = await supabaseAdmin
      .from('sites')
      .select('*')
      .eq('id', siteId)
      .single()

    if (siteError || !site) {
      return { data: null, error: 'Site not found' }
    }

    // Determine which page to load (home or specific slug)
    const pageSlug = slug || 'home'

    // Fetch the user page
    const { data: page, error: pageError } = await supabaseAdmin
      .from('users_pages')
      .select('*')
      .eq('site_id', siteId)
      .eq('slug', pageSlug)
      .eq('is_published', true)
      .single()

    if (pageError || !page) {
      // If specific page not found, try to get default page
      if (pageSlug !== 'home') {
        const { data: defaultPage } = await supabaseAdmin
          .from('users_pages')
          .select('*')
          .eq('site_id', siteId)
          .eq('is_default', true)
          .eq('is_published', true)
          .single()

        if (!defaultPage) {
          return { data: null, error: 'Page not found' }
        }

        // Use default page - build blocks with helper
        const blocks = buildUserPageBlocks(site, defaultPage)

        return {
          data: {
            id: site.id,
            name: site.name,
            subdomain: site.subdomain,
            custom_domain: site.custom_domain,
            settings: site.settings,
            blocks,
            currentPage: {
              id: defaultPage.id,
              title: defaultPage.title,
              slug: defaultPage.slug,
              meta_description: defaultPage.meta_description
            }
          },
          error: null
        }
      }

      return { data: null, error: 'Page not found' }
    }

    // Build blocks array with helper
    const blocks = buildUserPageBlocks(site, page)

    return {
      data: {
        id: site.id,
        name: site.name,
        subdomain: site.subdomain,
        custom_domain: site.custom_domain,
        settings: site.settings,
        blocks,
        currentPage: {
          id: page.id,
          title: page.title,
          slug: page.slug,
          meta_description: page.meta_description
        }
      },
      error: null
    }
  } catch (error: any) {
    console.error('Exception in getUserPageBySlug:', error)
    return { data: null, error: error.message || 'Failed to fetch user page' }
  }
}

/**
 * Get current user's site ID
 * Assumes user has only one site or returns the first one
 */
export async function getCurrentUserSiteId(): Promise<{ siteId: string | null; error: string | null }> {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return { siteId: null, error: 'Authentication required' }
    }

    // Get the user's first site
    const { data: sites, error: sitesError } = await supabaseAdmin
      .from('sites')
      .select('id')
      .eq('user_id', user.id)
      .limit(1)

    if (sitesError || !sites || sites.length === 0) {
      return { siteId: null, error: 'No site found for user' }
    }

    return { siteId: sites[0].id, error: null }
  } catch (error: any) {
    console.error('Exception in getCurrentUserSiteId:', error)
    return { siteId: null, error: error.message || 'Failed to get user site' }
  }
}
