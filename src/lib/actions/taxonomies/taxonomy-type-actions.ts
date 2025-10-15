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

export interface TaxonomyType {
  id: string
  site_id: string
  name: string
  slug: string
  description: string | null
  is_hierarchical: boolean
  display_order: number
  created_at: string
  updated_at: string
}

export interface CreateTaxonomyTypeData {
  name: string
  slug?: string
  description?: string
  is_hierarchical?: boolean
}

export interface UpdateTaxonomyTypeData {
  name?: string
  slug?: string
  description?: string | null
  is_hierarchical?: boolean
  display_order?: number
}

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 100)
}

/**
 * Get all taxonomy types for a site
 */
export async function getSiteTaxonomyTypesAction(siteId: string) {
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

    // Get taxonomy types for the site
    const { data: taxonomyTypes, error: typesError } = await supabaseAdmin
      .from('taxonomy_types')
      .select('*')
      .eq('site_id', siteId)
      .order('display_order', { ascending: true })
      .order('name', { ascending: true })

    if (typesError) {
      return { data: null, error: typesError.message }
    }

    return { data: taxonomyTypes as TaxonomyType[], error: null }
  } catch (error) {
    console.error('Error fetching taxonomy types:', error)
    return { data: null, error: 'Failed to fetch taxonomy types' }
  }
}

/**
 * Get a single taxonomy type by ID
 */
export async function getTaxonomyTypeByIdAction(typeId: string) {
  try {
    const supabase = await createServerSupabaseClient()

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return { data: null, error: 'Authentication required' }
    }

    // Get taxonomy type with site ownership check
    const { data: taxonomyType, error: typeError } = await supabaseAdmin
      .from('taxonomy_types')
      .select('*, sites!inner(user_id)')
      .eq('id', typeId)
      .single()

    if (typeError || !taxonomyType) {
      return { data: null, error: 'Taxonomy type not found' }
    }

    if (taxonomyType.sites.user_id !== user.id) {
      return { data: null, error: 'Unauthorized' }
    }

    return { data: taxonomyType as TaxonomyType, error: null }
  } catch (error) {
    console.error('Error fetching taxonomy type:', error)
    return { data: null, error: 'Failed to fetch taxonomy type' }
  }
}

/**
 * Get a taxonomy type by slug for a site
 */
export async function getTaxonomyTypeBySlugAction(siteId: string, slug: string) {
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

    // Get taxonomy type
    const { data: taxonomyType, error: typeError } = await supabaseAdmin
      .from('taxonomy_types')
      .select('*')
      .eq('site_id', siteId)
      .eq('slug', slug)
      .single()

    if (typeError || !taxonomyType) {
      return { data: null, error: 'Taxonomy type not found' }
    }

    return { data: taxonomyType as TaxonomyType, error: null }
  } catch (error) {
    console.error('Error fetching taxonomy type by slug:', error)
    return { data: null, error: 'Failed to fetch taxonomy type' }
  }
}

/**
 * Create a new taxonomy type
 */
export async function createTaxonomyTypeAction(siteId: string, data: CreateTaxonomyTypeData) {
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

    // Generate slug if not provided
    const slug = data.slug || generateSlug(data.name)

    // Check if slug already exists for this site
    const { data: existingType } = await supabaseAdmin
      .from('taxonomy_types')
      .select('id')
      .eq('site_id', siteId)
      .eq('slug', slug)
      .single()

    if (existingType) {
      return { data: null, error: 'A taxonomy type with this slug already exists' }
    }

    // Get the highest display_order
    const { data: maxOrderType } = await supabaseAdmin
      .from('taxonomy_types')
      .select('display_order')
      .eq('site_id', siteId)
      .order('display_order', { ascending: false })
      .limit(1)
      .single()

    const nextDisplayOrder = maxOrderType ? maxOrderType.display_order + 1 : 0

    // Create the taxonomy type
    const { data: newType, error: createError } = await supabaseAdmin
      .from('taxonomy_types')
      .insert({
        site_id: siteId,
        name: data.name,
        slug,
        description: data.description || null,
        is_hierarchical: data.is_hierarchical !== undefined ? data.is_hierarchical : true,
        display_order: nextDisplayOrder
      })
      .select()
      .single()

    if (createError) {
      return { data: null, error: createError.message }
    }

    // Revalidate cache
    revalidateTag('taxonomy-types')
    revalidateTag(`site-${siteId}`)

    return { data: newType as TaxonomyType, error: null }
  } catch (error) {
    console.error('Error creating taxonomy type:', error)
    return { data: null, error: 'Failed to create taxonomy type' }
  }
}

/**
 * Update a taxonomy type
 */
export async function updateTaxonomyTypeAction(typeId: string, data: UpdateTaxonomyTypeData) {
  try {
    const supabase = await createServerSupabaseClient()

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return { data: null, error: 'Authentication required' }
    }

    // Get the taxonomy type to verify ownership
    const { data: taxonomyType, error: typeError } = await supabaseAdmin
      .from('taxonomy_types')
      .select('*, sites!inner(user_id)')
      .eq('id', typeId)
      .single()

    if (typeError || !taxonomyType) {
      return { data: null, error: 'Taxonomy type not found' }
    }

    if (taxonomyType.sites.user_id !== user.id) {
      return { data: null, error: 'Unauthorized' }
    }

    // If slug is being updated, check if it's already taken
    if (data.slug && data.slug !== taxonomyType.slug) {
      const { data: existingType } = await supabaseAdmin
        .from('taxonomy_types')
        .select('id')
        .eq('site_id', taxonomyType.site_id)
        .eq('slug', data.slug)
        .neq('id', typeId)
        .single()

      if (existingType) {
        return { data: null, error: 'A taxonomy type with this slug already exists' }
      }
    }

    // Update the taxonomy type
    const { data: updatedType, error: updateError } = await supabaseAdmin
      .from('taxonomy_types')
      .update({
        ...data,
        updated_at: new Date().toISOString()
      })
      .eq('id', typeId)
      .select()
      .single()

    if (updateError) {
      return { data: null, error: updateError.message }
    }

    // Revalidate cache
    revalidateTag('taxonomy-types')
    revalidateTag(`taxonomy-type-${typeId}`)
    revalidateTag(`site-${taxonomyType.site_id}`)

    return { data: updatedType as TaxonomyType, error: null }
  } catch (error) {
    console.error('Error updating taxonomy type:', error)
    return { data: null, error: 'Failed to update taxonomy type' }
  }
}

/**
 * Delete a taxonomy type
 */
export async function deleteTaxonomyTypeAction(typeId: string) {
  try {
    const supabase = await createServerSupabaseClient()

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return { success: false, error: 'Authentication required' }
    }

    // Get the taxonomy type to verify ownership
    const { data: taxonomyType, error: typeError } = await supabaseAdmin
      .from('taxonomy_types')
      .select('*, sites!inner(user_id)')
      .eq('id', typeId)
      .single()

    if (typeError || !taxonomyType) {
      return { success: false, error: 'Taxonomy type not found' }
    }

    if (taxonomyType.sites.user_id !== user.id) {
      return { success: false, error: 'Unauthorized' }
    }

    // Get all taxonomies of this type to delete relationships
    const { data: taxonomiesToDelete, error: getTaxonomiesError } = await supabaseAdmin
      .from('taxonomies')
      .select('id')
      .eq('taxonomy_type_id', typeId)

    if (getTaxonomiesError) {
      return { success: false, error: getTaxonomiesError.message }
    }

    // Delete all taxonomy relationships first
    if (taxonomiesToDelete && taxonomiesToDelete.length > 0) {
      const taxonomyIds = taxonomiesToDelete.map(t => t.id)

      const { error: deleteRelationshipsError } = await supabaseAdmin
        .from('content_taxonomy_relationships')
        .delete()
        .in('taxonomy_id', taxonomyIds)

      if (deleteRelationshipsError) {
        return { success: false, error: deleteRelationshipsError.message }
      }

      // Delete all taxonomies of this type
      const { error: deleteTaxonomiesError } = await supabaseAdmin
        .from('taxonomies')
        .delete()
        .eq('taxonomy_type_id', typeId)

      if (deleteTaxonomiesError) {
        return { success: false, error: deleteTaxonomiesError.message }
      }
    }

    // Delete the taxonomy type
    const { error: deleteError } = await supabaseAdmin
      .from('taxonomy_types')
      .delete()
      .eq('id', typeId)

    if (deleteError) {
      return { success: false, error: deleteError.message }
    }

    // Revalidate cache
    revalidateTag('taxonomy-types')
    revalidateTag(`taxonomy-type-${typeId}`)
    revalidateTag(`site-${taxonomyType.site_id}`)

    return { success: true, error: null }
  } catch (error) {
    console.error('Error deleting taxonomy type:', error)
    return { success: false, error: 'Failed to delete taxonomy type' }
  }
}
