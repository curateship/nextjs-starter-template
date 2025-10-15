'use server'

import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { revalidateTag } from 'next/cache'

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

export interface Taxonomy {
  id: string
  site_id: string
  taxonomy_type_id: string
  title: string
  slug: string
  parent_id: string | null
  featured_image: string | null
  description: string | null
  meta_description: string | null
  content_blocks: Record<string, any>
  is_published: boolean
  display_order: number
  created_at: string
  updated_at: string
}

export interface TaxonomyWithDetails extends Taxonomy {
  site_name: string
  subdomain: string
  user_id: string
  taxonomy_type_name: string
  taxonomy_type_slug: string
  parent_title?: string
  children_count?: number
}

export interface CreateTaxonomyData {
  title: string
  slug?: string
  parent_id?: string | null
  featured_image?: string | null
  description?: string | null
  meta_description?: string | null
  content_blocks?: Record<string, any>
  is_published?: boolean
}

export interface UpdateTaxonomyData {
  title?: string
  slug?: string
  parent_id?: string | null
  featured_image?: string | null
  description?: string | null
  meta_description?: string | null
  content_blocks?: Record<string, any>
  is_published?: boolean
  display_order?: number
}

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 100)
}

/**
 * Get all taxonomies for a taxonomy type
 */
export async function getTaxonomiesForTypeAction(siteId: string, taxonomyTypeId: string) {
  try {
    const supabase = await createServerSupabaseClient()

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return { data: null, error: 'Authentication required' }
    }

    // Verify site ownership
    const { data: site, error: siteError } = await supabaseAdmin
      .from('sites')
      .select('id, user_id')
      .eq('id', siteId)
      .single()

    if (siteError || !site) {
      return { data: null, error: 'Site not found' }
    }

    if (site.user_id !== user.id) {
      return { data: null, error: 'Unauthorized' }
    }

    // Get taxonomies
    const { data: taxonomies, error: taxonomiesError } = await supabaseAdmin
      .from('taxonomies')
      .select('*')
      .eq('site_id', siteId)
      .eq('taxonomy_type_id', taxonomyTypeId)
      .order('display_order', { ascending: true })
      .order('title', { ascending: true })

    if (taxonomiesError) {
      return { data: null, error: taxonomiesError.message }
    }

    return { data: taxonomies as Taxonomy[], error: null }
  } catch (error) {
    console.error('Error fetching taxonomies:', error)
    return { data: null, error: 'Failed to fetch taxonomies' }
  }
}

/**
 * Get a single taxonomy by ID
 */
export async function getTaxonomyByIdAction(taxonomyId: string) {
  try {
    const supabase = await createServerSupabaseClient()

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return { data: null, error: 'Authentication required' }
    }

    // Get taxonomy with site details
    const { data: taxonomy, error: taxonomyError } = await supabaseAdmin
      .from('taxonomies')
      .select('*, sites!inner(user_id, name, subdomain), taxonomy_types!inner(name, slug)')
      .eq('id', taxonomyId)
      .single()

    if (taxonomyError || !taxonomy) {
      return { data: null, error: 'Taxonomy not found' }
    }

    if (taxonomy.sites.user_id !== user.id) {
      return { data: null, error: 'Unauthorized' }
    }

    const taxonomyWithDetails: TaxonomyWithDetails = {
      ...taxonomy,
      site_name: taxonomy.sites.name,
      subdomain: taxonomy.sites.subdomain,
      user_id: taxonomy.sites.user_id,
      taxonomy_type_name: taxonomy.taxonomy_types.name,
      taxonomy_type_slug: taxonomy.taxonomy_types.slug
    }

    return { data: taxonomyWithDetails, error: null }
  } catch (error) {
    console.error('Error fetching taxonomy:', error)
    return { data: null, error: 'Failed to fetch taxonomy' }
  }
}

/**
 * Get a taxonomy by slug
 */
export async function getTaxonomyBySlugAction(siteId: string, taxonomyTypeId: string, slug: string) {
  try {
    const supabase = await createServerSupabaseClient()

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return { data: null, error: 'Authentication required' }
    }

    // Verify site ownership
    const { data: site, error: siteError } = await supabaseAdmin
      .from('sites')
      .select('id, user_id')
      .eq('id', siteId)
      .single()

    if (siteError || !site) {
      return { data: null, error: 'Site not found' }
    }

    if (site.user_id !== user.id) {
      return { data: null, error: 'Unauthorized' }
    }

    // Get taxonomy
    const { data: taxonomy, error: taxonomyError } = await supabaseAdmin
      .from('taxonomies')
      .select('*')
      .eq('site_id', siteId)
      .eq('taxonomy_type_id', taxonomyTypeId)
      .eq('slug', slug)
      .single()

    if (taxonomyError || !taxonomy) {
      return { data: null, error: 'Taxonomy not found' }
    }

    return { data: taxonomy as Taxonomy, error: null }
  } catch (error) {
    console.error('Error fetching taxonomy by slug:', error)
    return { data: null, error: 'Failed to fetch taxonomy' }
  }
}

/**
 * Create a new taxonomy
 */
export async function createTaxonomyAction(
  siteId: string,
  taxonomyTypeId: string,
  data: CreateTaxonomyData
) {
  try {
    const supabase = await createServerSupabaseClient()

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return { data: null, error: 'Authentication required' }
    }

    // Verify site ownership
    const { data: site, error: siteError } = await supabaseAdmin
      .from('sites')
      .select('id, user_id')
      .eq('id', siteId)
      .single()

    if (siteError || !site) {
      return { data: null, error: 'Site not found' }
    }

    if (site.user_id !== user.id) {
      return { data: null, error: 'Unauthorized' }
    }

    // Verify taxonomy type exists and belongs to this site
    const { data: taxonomyType, error: typeError } = await supabaseAdmin
      .from('taxonomy_types')
      .select('id')
      .eq('id', taxonomyTypeId)
      .eq('site_id', siteId)
      .single()

    if (typeError || !taxonomyType) {
      return { data: null, error: 'Taxonomy type not found' }
    }

    // Generate slug if not provided
    const slug = data.slug || generateSlug(data.title)

    // Check if slug already exists for this type
    const { data: existingTaxonomy } = await supabaseAdmin
      .from('taxonomies')
      .select('id')
      .eq('site_id', siteId)
      .eq('taxonomy_type_id', taxonomyTypeId)
      .eq('slug', slug)
      .single()

    if (existingTaxonomy) {
      return { data: null, error: 'A taxonomy with this slug already exists in this type' }
    }

    // If parent_id is provided, verify it exists and belongs to the same type
    if (data.parent_id) {
      const { data: parentTaxonomy, error: parentError } = await supabaseAdmin
        .from('taxonomies')
        .select('id, taxonomy_type_id')
        .eq('id', data.parent_id)
        .eq('site_id', siteId)
        .single()

      if (parentError || !parentTaxonomy) {
        return { data: null, error: 'Parent taxonomy not found' }
      }

      if (parentTaxonomy.taxonomy_type_id !== taxonomyTypeId) {
        return { data: null, error: 'Parent taxonomy must be of the same type' }
      }
    }

    // Get the highest display_order
    const { data: maxOrderTaxonomy } = await supabaseAdmin
      .from('taxonomies')
      .select('display_order')
      .eq('site_id', siteId)
      .eq('taxonomy_type_id', taxonomyTypeId)
      .order('display_order', { ascending: false })
      .limit(1)
      .single()

    const nextDisplayOrder = maxOrderTaxonomy ? maxOrderTaxonomy.display_order + 1 : 0

    // Create the taxonomy
    const { data: newTaxonomy, error: createError } = await supabaseAdmin
      .from('taxonomies')
      .insert({
        site_id: siteId,
        taxonomy_type_id: taxonomyTypeId,
        title: data.title,
        slug,
        parent_id: data.parent_id || null,
        featured_image: data.featured_image || null,
        description: data.description || null,
        meta_description: data.meta_description || null,
        content_blocks: data.content_blocks || {},
        is_published: data.is_published ?? false, // Default to draft
        display_order: nextDisplayOrder
      })
      .select()
      .single()

    if (createError) {
      return { data: null, error: createError.message }
    }

    // Revalidate cache
    revalidateTag('taxonomies')
    revalidateTag(`taxonomy-type-${taxonomyTypeId}`)
    revalidateTag(`site-${siteId}`)

    return { data: newTaxonomy as Taxonomy, error: null }
  } catch (error) {
    console.error('Error creating taxonomy:', error)
    return { data: null, error: 'Failed to create taxonomy' }
  }
}

/**
 * Update a taxonomy
 */
export async function updateTaxonomyAction(taxonomyId: string, data: UpdateTaxonomyData) {
  try {
    const supabase = await createServerSupabaseClient()

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return { data: null, error: 'Authentication required' }
    }

    // Get the taxonomy to verify ownership
    const { data: taxonomy, error: taxonomyError } = await supabaseAdmin
      .from('taxonomies')
      .select('*, sites!inner(user_id)')
      .eq('id', taxonomyId)
      .single()

    if (taxonomyError || !taxonomy) {
      return { data: null, error: 'Taxonomy not found' }
    }

    if (taxonomy.sites.user_id !== user.id) {
      return { data: null, error: 'Unauthorized' }
    }

    // If slug is being updated, check if it's already taken
    if (data.slug && data.slug !== taxonomy.slug) {
      const { data: existingTaxonomy } = await supabaseAdmin
        .from('taxonomies')
        .select('id')
        .eq('site_id', taxonomy.site_id)
        .eq('taxonomy_type_id', taxonomy.taxonomy_type_id)
        .eq('slug', data.slug)
        .neq('id', taxonomyId)
        .single()

      if (existingTaxonomy) {
        return { data: null, error: 'A taxonomy with this slug already exists' }
      }
    }

    // If parent_id is being updated, verify it exists and prevent circular references
    if (data.parent_id !== undefined) {
      if (data.parent_id === taxonomyId) {
        return { data: null, error: 'A taxonomy cannot be its own parent' }
      }

      if (data.parent_id) {
        const { data: parentTaxonomy, error: parentError } = await supabaseAdmin
          .from('taxonomies')
          .select('id, taxonomy_type_id, parent_id')
          .eq('id', data.parent_id)
          .eq('site_id', taxonomy.site_id)
          .single()

        if (parentError || !parentTaxonomy) {
          return { data: null, error: 'Parent taxonomy not found' }
        }

        if (parentTaxonomy.taxonomy_type_id !== taxonomy.taxonomy_type_id) {
          return { data: null, error: 'Parent taxonomy must be of the same type' }
        }

        // Check for circular reference (if parent's parent is this taxonomy)
        if (parentTaxonomy.parent_id === taxonomyId) {
          return { data: null, error: 'Circular parent relationship detected' }
        }
      }
    }

    // Update the taxonomy
    const { data: updatedTaxonomy, error: updateError } = await supabaseAdmin
      .from('taxonomies')
      .update({
        ...data,
        updated_at: new Date().toISOString()
      })
      .eq('id', taxonomyId)
      .select()
      .single()

    if (updateError) {
      return { data: null, error: updateError.message }
    }

    // Revalidate cache
    revalidateTag('taxonomies')
    revalidateTag(`taxonomy-${taxonomyId}`)
    revalidateTag(`taxonomy-type-${taxonomy.taxonomy_type_id}`)
    revalidateTag(`site-${taxonomy.site_id}`)

    return { data: updatedTaxonomy as Taxonomy, error: null }
  } catch (error) {
    console.error('Error updating taxonomy:', error)
    return { data: null, error: 'Failed to update taxonomy' }
  }
}

/**
 * Delete a taxonomy
 */
export async function deleteTaxonomyAction(taxonomyId: string) {
  try {
    const supabase = await createServerSupabaseClient()

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return { success: false, error: 'Authentication required' }
    }

    // Get the taxonomy to verify ownership
    const { data: taxonomy, error: taxonomyError } = await supabaseAdmin
      .from('taxonomies')
      .select('*, sites!inner(user_id)')
      .eq('id', taxonomyId)
      .single()

    if (taxonomyError || !taxonomy) {
      return { success: false, error: 'Taxonomy not found' }
    }

    if (taxonomy.sites.user_id !== user.id) {
      return { success: false, error: 'Unauthorized' }
    }

    // Check if there are child taxonomies
    const { data: children, error: childrenError } = await supabaseAdmin
      .from('taxonomies')
      .select('id')
      .eq('parent_id', taxonomyId)
      .limit(1)

    if (childrenError) {
      return { success: false, error: childrenError.message }
    }

    if (children && children.length > 0) {
      return { success: false, error: 'Cannot delete taxonomy that has child taxonomies. Delete children first or reassign them.' }
    }

    // Check if there are content relationships
    const { data: relationships, error: relationshipsError } = await supabaseAdmin
      .from('content_taxonomy_relationships')
      .select('id')
      .eq('taxonomy_id', taxonomyId)
      .limit(1)

    if (relationshipsError) {
      return { success: false, error: relationshipsError.message }
    }

    if (relationships && relationships.length > 0) {
      return { success: false, error: 'Cannot delete taxonomy that is assigned to content. Remove all assignments first.' }
    }

    // Delete the taxonomy
    const { error: deleteError } = await supabaseAdmin
      .from('taxonomies')
      .delete()
      .eq('id', taxonomyId)

    if (deleteError) {
      return { success: false, error: deleteError.message }
    }

    // Revalidate cache
    revalidateTag('taxonomies')
    revalidateTag(`taxonomy-${taxonomyId}`)
    revalidateTag(`taxonomy-type-${taxonomy.taxonomy_type_id}`)
    revalidateTag(`site-${taxonomy.site_id}`)

    return { success: true, error: null }
  } catch (error) {
    console.error('Error deleting taxonomy:', error)
    return { success: false, error: 'Failed to delete taxonomy' }
  }
}

/**
 * Update taxonomy blocks (for builder)
 */
export async function updateTaxonomyBlocksAction(taxonomyId: string, contentBlocks: Record<string, any>) {
  try {
    const supabase = await createServerSupabaseClient()

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return { success: false, error: 'Authentication required' }
    }

    // Get the taxonomy to verify ownership
    const { data: taxonomy, error: taxonomyError } = await supabaseAdmin
      .from('taxonomies')
      .select('*, sites!inner(user_id)')
      .eq('id', taxonomyId)
      .single()

    if (taxonomyError || !taxonomy) {
      return { success: false, error: 'Taxonomy not found' }
    }

    if (taxonomy.sites.user_id !== user.id) {
      return { success: false, error: 'Unauthorized' }
    }

    // Update the taxonomy blocks
    const { data: updatedTaxonomy, error: updateError } = await supabaseAdmin
      .from('taxonomies')
      .update({
        content_blocks: contentBlocks,
        updated_at: new Date().toISOString()
      })
      .eq('id', taxonomyId)
      .select()
      .single()

    if (updateError) {
      return { success: false, error: updateError.message }
    }

    // Revalidate cache
    revalidateTag('taxonomies')
    revalidateTag(`taxonomy-${taxonomyId}`)
    revalidateTag(`site-${taxonomy.site_id}`)

    return { success: true, error: null }
  } catch (error) {
    console.error('Error updating taxonomy blocks:', error)
    return { success: false, error: 'Failed to update taxonomy blocks' }
  }
}

/**
 * Duplicate a taxonomy
 */
export async function duplicateTaxonomyAction(taxonomyId: string, newTitle: string) {
  try {
    const supabase = await createServerSupabaseClient()

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return { data: null, error: 'Authentication required' }
    }

    // Get the original taxonomy
    const { data: originalTaxonomy, error: taxonomyError } = await supabaseAdmin
      .from('taxonomies')
      .select('*, sites!inner(user_id)')
      .eq('id', taxonomyId)
      .single()

    if (taxonomyError || !originalTaxonomy) {
      return { data: null, error: 'Taxonomy not found' }
    }

    if (originalTaxonomy.sites.user_id !== user.id) {
      return { data: null, error: 'Unauthorized' }
    }

    // Generate a unique slug for the duplicate
    const baseSlug = generateSlug(newTitle)
    let slug = baseSlug
    let counter = 1

    while (true) {
      const { data: existingTaxonomy } = await supabaseAdmin
        .from('taxonomies')
        .select('id')
        .eq('site_id', originalTaxonomy.site_id)
        .eq('taxonomy_type_id', originalTaxonomy.taxonomy_type_id)
        .eq('slug', slug)
        .single()

      if (!existingTaxonomy) break
      slug = `${baseSlug}-${counter}`
      counter++
    }

    // Get the highest display_order
    const { data: maxOrderTaxonomy } = await supabaseAdmin
      .from('taxonomies')
      .select('display_order')
      .eq('site_id', originalTaxonomy.site_id)
      .eq('taxonomy_type_id', originalTaxonomy.taxonomy_type_id)
      .order('display_order', { ascending: false })
      .limit(1)
      .single()

    const nextDisplayOrder = maxOrderTaxonomy ? maxOrderTaxonomy.display_order + 1 : 0

    // Create the duplicate
    const { data: newTaxonomy, error: createError } = await supabaseAdmin
      .from('taxonomies')
      .insert({
        site_id: originalTaxonomy.site_id,
        taxonomy_type_id: originalTaxonomy.taxonomy_type_id,
        title: newTitle,
        slug,
        parent_id: originalTaxonomy.parent_id,
        featured_image: originalTaxonomy.featured_image,
        description: originalTaxonomy.description,
        meta_description: originalTaxonomy.meta_description,
        content_blocks: originalTaxonomy.content_blocks || {},
        is_published: false, // Always create duplicates as draft
        display_order: nextDisplayOrder
      })
      .select()
      .single()

    if (createError) {
      return { data: null, error: createError.message }
    }

    // Revalidate cache
    revalidateTag('taxonomies')
    revalidateTag(`taxonomy-type-${originalTaxonomy.taxonomy_type_id}`)
    revalidateTag(`site-${originalTaxonomy.site_id}`)

    return { data: newTaxonomy as Taxonomy, error: null }
  } catch (error) {
    console.error('Error duplicating taxonomy:', error)
    return { data: null, error: 'Failed to duplicate taxonomy' }
  }
}
