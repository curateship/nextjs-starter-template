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

export type ContentType = 'directory' | 'product' | 'post' | 'event' | 'page'

export interface ContentTaxonomyRelationship {
  id: string
  content_id: string
  content_type: ContentType
  taxonomy_id: string
  created_at: string
}

export interface TaxonomyWithType {
  id: string
  title: string
  slug: string
  parent_id: string | null
  taxonomy_type_id: string
  taxonomy_type_name: string
  taxonomy_type_slug: string
  parent_title?: string
}

/**
 * Assign a taxonomy to content
 */
export async function assignTaxonomyToContentAction(
  contentId: string,
  contentType: ContentType,
  taxonomyId: string
) {
  try {
    const supabase = await createServerSupabaseClient()

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return { success: false, error: 'Authentication required' }
    }

    // Verify the taxonomy exists and user has access to it
    const { data: taxonomy, error: taxonomyError } = await supabaseAdmin
      .from('taxonomies')
      .select('id, site_id, sites!inner(user_id)')
      .eq('id', taxonomyId)
      .single()

    if (taxonomyError || !taxonomy) {
      return { success: false, error: 'Taxonomy not found' }
    }

    if (taxonomy.sites[0]?.user_id !== user.id) {
      return { success: false, error: 'Unauthorized' }
    }

    // Verify the content exists and belongs to the same site
    // We'll check based on content type
    const tableName = getTableNameForContentType(contentType)
    if (!tableName) {
      return { success: false, error: 'Invalid content type' }
    }

    const { data: content, error: contentError } = await supabaseAdmin
      .from(tableName)
      .select('id, site_id')
      .eq('id', contentId)
      .single()

    if (contentError || !content) {
      return { success: false, error: 'Content not found' }
    }

    if (content.site_id !== taxonomy.site_id) {
      return { success: false, error: 'Content and taxonomy must belong to the same site' }
    }

    // Check if relationship already exists
    const { data: existingRelationship } = await supabaseAdmin
      .from('taxonomy_relationships')
      .select('id')
      .eq('content_id', contentId)
      .eq('taxonomy_id', taxonomyId)
      .eq('content_type', contentType)
      .single()

    if (existingRelationship) {
      return { success: true, error: null } // Already assigned, consider it success
    }

    // Create the relationship
    const { error: createError } = await supabaseAdmin
      .from('taxonomy_relationships')
      .insert({
        content_id: contentId,
        content_type: contentType,
        taxonomy_id: taxonomyId
      })

    if (createError) {
      return { success: false, error: createError.message }
    }

    // Revalidate cache
    revalidateTag('content-taxonomies')
    revalidateTag(`${contentType}-${contentId}`)
    revalidateTag(`taxonomy-${taxonomyId}`)

    return { success: true, error: null }
  } catch (error) {
    console.error('Error assigning taxonomy to content:', error)
    return { success: false, error: 'Failed to assign taxonomy to content' }
  }
}

/**
 * Remove a taxonomy from content
 */
export async function removeTaxonomyFromContentAction(
  contentId: string,
  contentType: ContentType,
  taxonomyId: string
) {
  try {
    const supabase = await createServerSupabaseClient()

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return { success: false, error: 'Authentication required' }
    }

    // Verify the taxonomy exists and user has access to it
    const { data: taxonomy, error: taxonomyError } = await supabaseAdmin
      .from('taxonomies')
      .select('id, sites!inner(user_id)')
      .eq('id', taxonomyId)
      .single()

    if (taxonomyError || !taxonomy) {
      return { success: false, error: 'Taxonomy not found' }
    }

    if (taxonomy.sites[0]?.user_id !== user.id) {
      return { success: false, error: 'Unauthorized' }
    }

    // Delete the relationship
    const { error: deleteError } = await supabaseAdmin
      .from('taxonomy_relationships')
      .delete()
      .eq('content_id', contentId)
      .eq('taxonomy_id', taxonomyId)
      .eq('content_type', contentType)

    if (deleteError) {
      return { success: false, error: deleteError.message }
    }

    // Revalidate cache
    revalidateTag('content-taxonomies')
    revalidateTag(`${contentType}-${contentId}`)
    revalidateTag(`taxonomy-${taxonomyId}`)

    return { success: true, error: null }
  } catch (error) {
    console.error('Error removing taxonomy from content:', error)
    return { success: false, error: 'Failed to remove taxonomy from content' }
  }
}

/**
 * Get all taxonomies assigned to a piece of content
 */
export async function getContentTaxonomiesAction(contentId: string, contentType: ContentType) {
  try {
    const supabase = await createServerSupabaseClient()

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return { data: null, error: 'Authentication required' }
    }

    // Get taxonomies with their type information
    const { data: relationships, error: relationshipsError } = await supabaseAdmin
      .from('taxonomy_relationships')
      .select(`
        id,
        taxonomy_id,
        taxonomies!inner(
          id,
          title,
          slug,
          parent_id,
          taxonomy_type_id,
          taxonomy_types!inner(
            name,
            slug
          )
        )
      `)
      .eq('content_id', contentId)
      .eq('content_type', contentType)

    if (relationshipsError) {
      return { data: null, error: relationshipsError.message }
    }

    // Transform the data to include parent information
    const taxonomiesWithDetails: TaxonomyWithType[] = await Promise.all(
      (relationships || []).map(async (rel: any) => {
        const taxonomy = rel.taxonomies
        let parentTitle: string | undefined

        // If has parent, fetch parent title
        if (taxonomy.parent_id) {
          const { data: parent } = await supabaseAdmin
            .from('taxonomies')
            .select('title')
            .eq('id', taxonomy.parent_id)
            .single()

          if (parent) {
            parentTitle = parent.title
          }
        }

        return {
          id: taxonomy.id,
          title: taxonomy.title,
          slug: taxonomy.slug,
          parent_id: taxonomy.parent_id,
          taxonomy_type_id: taxonomy.taxonomy_type_id,
          taxonomy_type_name: taxonomy.taxonomy_types.name,
          taxonomy_type_slug: taxonomy.taxonomy_types.slug,
          parent_title: parentTitle
        }
      })
    )

    return { data: taxonomiesWithDetails, error: null }
  } catch (error) {
    console.error('Error getting content taxonomies:', error)
    return { data: null, error: 'Failed to get content taxonomies' }
  }
}

/**
 * Get all content assigned to a taxonomy
 */
export async function getTaxonomyContentAction(
  taxonomyId: string,
  contentType?: ContentType,
  limit?: number
) {
  try {
    const supabase = await createServerSupabaseClient()

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return { data: null, error: 'Authentication required' }
    }

    // Verify taxonomy exists and user has access
    const { data: taxonomy, error: taxonomyError } = await supabaseAdmin
      .from('taxonomies')
      .select('id, sites!inner(user_id)')
      .eq('id', taxonomyId)
      .single()

    if (taxonomyError || !taxonomy) {
      return { data: null, error: 'Taxonomy not found' }
    }

    if (taxonomy.sites[0]?.user_id !== user.id) {
      return { data: null, error: 'Unauthorized' }
    }

    // Build query
    let query = supabaseAdmin
      .from('taxonomy_relationships')
      .select('content_id, content_type, created_at')
      .eq('taxonomy_id', taxonomyId)

    if (contentType) {
      query = query.eq('content_type', contentType)
    }

    if (limit) {
      query = query.limit(limit)
    }

    query = query.order('created_at', { ascending: false })

    const { data: relationships, error: relationshipsError } = await query

    if (relationshipsError) {
      return { data: null, error: relationshipsError.message }
    }

    return { data: relationships as ContentTaxonomyRelationship[], error: null }
  } catch (error) {
    console.error('Error getting taxonomy content:', error)
    return { data: null, error: 'Failed to get taxonomy content' }
  }
}

/**
 * Bulk assign multiple taxonomies to content
 */
export async function bulkAssignTaxonomiesToContentAction(
  contentId: string,
  contentType: ContentType,
  taxonomyIds: string[]
) {
  try {
    const supabase = await createServerSupabaseClient()

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return { success: false, error: 'Authentication required' }
    }

    // Verify all taxonomies exist and belong to user
    const { data: taxonomies, error: taxonomiesError } = await supabaseAdmin
      .from('taxonomies')
      .select('id, site_id, sites!inner(user_id)')
      .in('id', taxonomyIds)

    if (taxonomiesError) {
      return { success: false, error: taxonomiesError.message }
    }

    if (!taxonomies || taxonomies.length !== taxonomyIds.length) {
      return { success: false, error: 'One or more taxonomies not found' }
    }

    // Check all taxonomies belong to user
    const unauthorizedTaxonomy = taxonomies.find((t: any) => t.sites.user_id !== user.id)
    if (unauthorizedTaxonomy) {
      return { success: false, error: 'Unauthorized access to one or more taxonomies' }
    }

    // Verify all taxonomies belong to the same site
    const siteIds = new Set(taxonomies.map((t: any) => t.site_id))
    if (siteIds.size > 1) {
      return { success: false, error: 'All taxonomies must belong to the same site' }
    }

    const siteId = taxonomies[0].site_id

    // Verify content exists and belongs to the same site
    const tableName = getTableNameForContentType(contentType)
    if (!tableName) {
      return { success: false, error: 'Invalid content type' }
    }

    const { data: content, error: contentError } = await supabaseAdmin
      .from(tableName)
      .select('id, site_id')
      .eq('id', contentId)
      .single()

    if (contentError || !content) {
      return { success: false, error: 'Content not found' }
    }

    if (content.site_id !== siteId) {
      return { success: false, error: 'Content and taxonomies must belong to the same site' }
    }

    // First, remove all existing taxonomies for this content
    await supabaseAdmin
      .from('taxonomy_relationships')
      .delete()
      .eq('content_id', contentId)
      .eq('content_type', contentType)

    // Then, insert new relationships
    const relationships = taxonomyIds.map(taxonomyId => ({
      content_id: contentId,
      content_type: contentType,
      taxonomy_id: taxonomyId
    }))

    const { error: insertError } = await supabaseAdmin
      .from('taxonomy_relationships')
      .insert(relationships)

    if (insertError) {
      return { success: false, error: insertError.message }
    }

    // Revalidate cache
    revalidateTag('content-taxonomies')
    revalidateTag(`${contentType}-${contentId}`)
    taxonomyIds.forEach(id => revalidateTag(`taxonomy-${id}`))

    return { success: true, error: null }
  } catch (error) {
    console.error('Error bulk assigning taxonomies:', error)
    return { success: false, error: 'Failed to bulk assign taxonomies' }
  }
}

/**
 * Helper function to get table name for content type
 */
function getTableNameForContentType(contentType: ContentType): string | null {
  const tableMap: Record<ContentType, string> = {
    directory: 'directory',
    product: 'products',
    post: 'posts',
    event: 'events',
    page: 'pages'
  }

  return tableMap[contentType] || null
}
