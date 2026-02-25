'use server'

import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import type { Site } from '@/lib/actions/sites/site-actions'

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
            // Ignored for Server Components
          }
        },
      },
    }
  )
}

async function getAuthenticatedUser() {
  const supabase = await createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null
  return user
}

/**
 * Save a site as a reusable theme template.
 * Creates a new site with is_template=true, copying settings and all pages.
 */
export async function saveAsThemeAction(
  siteId: string,
  name: string,
  description?: string
): Promise<{ data: Site | null; error: string | null }> {
  try {
    const user = await getAuthenticatedUser()
    if (!user) return { data: null, error: 'Authentication required' }

    // Verify user owns the source site
    const { data: sourceSite, error: siteError } = await supabaseAdmin
      .from('sites')
      .select('*')
      .eq('id', siteId)
      .eq('user_id', user.id)
      .single()

    if (siteError || !sourceSite) {
      return { data: null, error: 'Site not found or access denied' }
    }

    // Create template site — no subdomain needed for templates
    const templateSubdomain = `template-${name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')}-${Date.now()}`

    // Navigation and footer live inside settings.public_pages — copying settings copies them too
    const { data: templateSite, error: createError } = await supabaseAdmin
      .from('sites')
      .insert([{
        name,
        user_id: user.id,
        subdomain: templateSubdomain,
        status: 'draft',
        is_template: true,
        custom_domain: null,
        settings: {
          ...sourceSite.settings,
          description: description || null,
        },
      }])
      .select()
      .single()

    if (createError || !templateSite) {
      return { data: null, error: `Failed to create template: ${createError?.message}` }
    }

    // Delete trigger-created default pages before cloning source pages
    await supabaseAdmin.from('pages').delete().eq('site_id', templateSite.id)

    // Clone all pages from source site
    const { data: sourcePages, error: pagesError } = await supabaseAdmin
      .from('pages')
      .select('*')
      .eq('site_id', siteId)
      .order('display_order', { ascending: true })

    if (pagesError) {
      return { data: null, error: `Failed to read source pages: ${pagesError.message}` }
    }

    if (sourcePages && sourcePages.length > 0) {
      const clonedPages = sourcePages.map(page => ({
        site_id: templateSite.id,
        title: page.title,
        slug: page.slug,
        meta_description: page.meta_description,
        is_homepage: page.is_homepage,
        is_published: page.is_published,
        display_order: page.display_order,
        content_blocks: page.content_blocks,
      }))

      const { error: insertError } = await supabaseAdmin
        .from('pages')
        .insert(clonedPages)

      if (insertError) {
        // Clean up the template site if page cloning fails
        await supabaseAdmin.from('sites').delete().eq('id', templateSite.id)
        return { data: null, error: `Failed to clone pages: ${insertError.message}` }
      }
    }

    revalidatePath('/admin/themes')
    return { data: templateSite as Site, error: null }
  } catch (error) {
    return {
      data: null,
      error: `Server error: ${error instanceof Error ? error.message : String(error)}`
    }
  }
}

/**
 * Get all template sites owned by the current user.
 */
export async function getTemplateSitesAction(): Promise<{ data: Site[] | null; error: string | null }> {
  try {
    const user = await getAuthenticatedUser()
    if (!user) return { data: null, error: 'Authentication required' }

    const { data, error } = await supabaseAdmin
      .from('sites')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_template', true)
      .order('created_at', { ascending: false })

    if (error) {
      return { data: null, error: `Database error: ${error.message}` }
    }

    return { data: data as Site[], error: null }
  } catch (error) {
    return {
      data: null,
      error: `Server error: ${error instanceof Error ? error.message : String(error)}`
    }
  }
}

/**
 * Apply a template's settings and pages to a target site.
 * Replaces settings (preserving tracking_scripts and maintenance), nav, footer, and all pages.
 */
export async function applyThemeToSiteAction(
  siteId: string,
  templateId: string
): Promise<{ success: boolean; error: string | null }> {
  try {
    const user = await getAuthenticatedUser()
    if (!user) return { success: false, error: 'Authentication required' }

    // Verify user owns both sites
    const [{ data: targetSite }, { data: templateSite }] = await Promise.all([
      supabaseAdmin.from('sites').select('*').eq('id', siteId).eq('user_id', user.id).single(),
      supabaseAdmin.from('sites').select('*').eq('id', templateId).eq('user_id', user.id).eq('is_template', true).single(),
    ])

    if (!targetSite) return { success: false, error: 'Target site not found or access denied' }
    if (!templateSite) return { success: false, error: 'Template not found or access denied' }

    // Merge settings — preserve site-specific fields
    const mergedSettings = {
      ...templateSite.settings,
      tracking_scripts: targetSite.settings?.tracking_scripts,
      maintenance: targetSite.settings?.maintenance,
      site_title: targetSite.settings?.site_title || targetSite.name,
    }

    // Update target site settings (nav/footer live inside settings.public_pages)
    const { error: updateError } = await supabaseAdmin
      .from('sites')
      .update({
        settings: mergedSettings,
        updated_at: new Date().toISOString(),
      })
      .eq('id', siteId)

    if (updateError) {
      return { success: false, error: `Failed to update site settings: ${updateError.message}` }
    }

    // Delete existing pages on target site
    const { error: deleteError } = await supabaseAdmin
      .from('pages')
      .delete()
      .eq('site_id', siteId)

    if (deleteError) {
      return { success: false, error: `Failed to clear existing pages: ${deleteError.message}` }
    }

    // Clone template pages to target site
    const { data: templatePages } = await supabaseAdmin
      .from('pages')
      .select('*')
      .eq('site_id', templateId)
      .order('display_order', { ascending: true })

    if (templatePages && templatePages.length > 0) {
      const clonedPages = templatePages.map(page => ({
        site_id: siteId,
        title: page.title,
        slug: page.slug,
        meta_description: page.meta_description,
        is_homepage: page.is_homepage,
        is_published: page.is_published,
        display_order: page.display_order,
        content_blocks: page.content_blocks,
      }))

      const { error: insertError } = await supabaseAdmin
        .from('pages')
        .insert(clonedPages)

      if (insertError) {
        return { success: false, error: `Failed to clone template pages: ${insertError.message}` }
      }
    }

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
 * Rename a template.
 */
export async function updateTemplateAction(
  templateId: string,
  updates: { name?: string }
): Promise<{ data: Site | null; error: string | null }> {
  try {
    const user = await getAuthenticatedUser()
    if (!user) return { data: null, error: 'Authentication required' }

    const { data, error } = await supabaseAdmin
      .from('sites')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', templateId)
      .eq('user_id', user.id)
      .eq('is_template', true)
      .select()
      .single()

    if (error) {
      return { data: null, error: `Failed to update template: ${error.message}` }
    }

    revalidatePath('/admin/themes')
    return { data: data as Site, error: null }
  } catch (error) {
    return {
      data: null,
      error: `Server error: ${error instanceof Error ? error.message : String(error)}`
    }
  }
}

/**
 * Delete a template site (cascades to its pages).
 */
export async function deleteTemplateAction(
  templateId: string
): Promise<{ success: boolean; error: string | null }> {
  try {
    const user = await getAuthenticatedUser()
    if (!user) return { success: false, error: 'Authentication required' }

    const { error } = await supabaseAdmin
      .from('sites')
      .delete()
      .eq('id', templateId)
      .eq('user_id', user.id)
      .eq('is_template', true)

    if (error) {
      return { success: false, error: `Failed to delete template: ${error.message}` }
    }

    revalidatePath('/admin/themes')
    return { success: true, error: null }
  } catch (error) {
    return {
      success: false,
      error: `Server error: ${error instanceof Error ? error.message : String(error)}`
    }
  }
}
