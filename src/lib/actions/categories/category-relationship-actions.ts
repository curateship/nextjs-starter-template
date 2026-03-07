'use server'

import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { revalidateTag } from 'next/cache'

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
            // Server Component context
          }
        },
      },
    }
  )
}

export type ContentType = 'directory' | 'product' | 'post' | 'event' | 'page'

export interface ContentCategoryRelationship {
  id: string
  content_id: string
  content_type: ContentType
  category_id: string
  created_at: string
}

export interface CategoryInfo {
  id: string
  title: string
  slug: string
  parent_id: string | null
  parent_title?: string
}

/**
 * Assign a category to content
 */
export async function assignCategoryToContentAction(
  contentId: string,
  contentType: ContentType,
  categoryId: string
) {
  try {
    const supabase = await createServerSupabaseClient()

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return { success: false, error: 'Authentication required' }
    }

    const { data: category, error: categoryError } = await supabaseAdmin
      .from('categories')
      .select('id, site_id, sites!inner(user_id)')
      .eq('id', categoryId)
      .single()

    if (categoryError || !category) {
      return { success: false, error: 'Category not found' }
    }

    if (category.sites[0]?.user_id !== user.id) {
      return { success: false, error: 'Unauthorized' }
    }

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

    if (content.site_id !== category.site_id) {
      return { success: false, error: 'Content and category must belong to the same site' }
    }

    const { data: existingRelationship } = await supabaseAdmin
      .from('category_relationships')
      .select('id')
      .eq('content_id', contentId)
      .eq('category_id', categoryId)
      .eq('content_type', contentType)
      .single()

    if (existingRelationship) {
      return { success: true, error: null }
    }

    const { error: createError } = await supabaseAdmin
      .from('category_relationships')
      .insert({
        content_id: contentId,
        content_type: contentType,
        category_id: categoryId
      })

    if (createError) {
      return { success: false, error: createError.message }
    }

    revalidateTag('content-categories')
    revalidateTag(`${contentType}-${contentId}`)
    revalidateTag(`category-${categoryId}`)

    return { success: true, error: null }
  } catch (error) {
    console.error('Error assigning category to content:', error)
    return { success: false, error: 'Failed to assign category to content' }
  }
}

/**
 * Remove a category from content
 */
export async function removeCategoryFromContentAction(
  contentId: string,
  contentType: ContentType,
  categoryId: string
) {
  try {
    const supabase = await createServerSupabaseClient()

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return { success: false, error: 'Authentication required' }
    }

    const { data: category, error: categoryError } = await supabaseAdmin
      .from('categories')
      .select('id, sites!inner(user_id)')
      .eq('id', categoryId)
      .single()

    if (categoryError || !category) {
      return { success: false, error: 'Category not found' }
    }

    if (category.sites[0]?.user_id !== user.id) {
      return { success: false, error: 'Unauthorized' }
    }

    const { error: deleteError } = await supabaseAdmin
      .from('category_relationships')
      .delete()
      .eq('content_id', contentId)
      .eq('category_id', categoryId)
      .eq('content_type', contentType)

    if (deleteError) {
      return { success: false, error: deleteError.message }
    }

    revalidateTag('content-categories')
    revalidateTag(`${contentType}-${contentId}`)
    revalidateTag(`category-${categoryId}`)

    return { success: true, error: null }
  } catch (error) {
    console.error('Error removing category from content:', error)
    return { success: false, error: 'Failed to remove category from content' }
  }
}

/**
 * Get all categories assigned to a piece of content
 */
export async function getContentCategoriesAction(contentId: string, contentType: ContentType) {
  try {
    const supabase = await createServerSupabaseClient()

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return { data: null, error: 'Authentication required' }
    }

    const { data: relationships, error: relationshipsError } = await supabaseAdmin
      .from('category_relationships')
      .select(`
        id,
        category_id,
        categories!inner(
          id,
          title,
          slug,
          parent_id
        )
      `)
      .eq('content_id', contentId)
      .eq('content_type', contentType)

    if (relationshipsError) {
      return { data: null, error: relationshipsError.message }
    }

    const categoriesWithDetails: CategoryInfo[] = await Promise.all(
      (relationships || []).map(async (rel: any) => {
        const category = rel.categories
        let parentTitle: string | undefined

        if (category.parent_id) {
          const { data: parent } = await supabaseAdmin
            .from('categories')
            .select('title')
            .eq('id', category.parent_id)
            .single()

          if (parent) {
            parentTitle = parent.title
          }
        }

        return {
          id: category.id,
          title: category.title,
          slug: category.slug,
          parent_id: category.parent_id,
          parent_title: parentTitle
        }
      })
    )

    return { data: categoriesWithDetails, error: null }
  } catch (error) {
    console.error('Error getting content categories:', error)
    return { data: null, error: 'Failed to get content categories' }
  }
}

/**
 * Get categories for multiple content items in a single query
 */
export async function getBulkContentCategoriesAction(
  contentIds: string[],
  contentType: ContentType
): Promise<{ data: Record<string, CategoryInfo[]> | null; error: string | null }> {
  try {
    if (contentIds.length === 0) return { data: {}, error: null }

    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return { data: null, error: 'Authentication required' }
    }

    const { data: relationships, error: relationshipsError } = await supabaseAdmin
      .from('category_relationships')
      .select(`
        content_id,
        category_id,
        categories!inner(
          id,
          title,
          slug,
          parent_id
        )
      `)
      .in('content_id', contentIds)
      .eq('content_type', contentType)

    if (relationshipsError) {
      return { data: null, error: relationshipsError.message }
    }

    // Collect unique parent IDs to batch-fetch parent titles
    const parentIds = new Set<string>()
    for (const rel of relationships || []) {
      const cat = (rel as any).categories
      if (cat.parent_id) parentIds.add(cat.parent_id)
    }

    let parentTitles: Record<string, string> = {}
    if (parentIds.size > 0) {
      const { data: parents } = await supabaseAdmin
        .from('categories')
        .select('id, title')
        .in('id', Array.from(parentIds))

      if (parents) {
        parentTitles = Object.fromEntries(parents.map(p => [p.id, p.title]))
      }
    }

    // Group by content_id
    const result: Record<string, CategoryInfo[]> = {}
    for (const rel of relationships || []) {
      const cat = (rel as any).categories
      const contentId = rel.content_id

      if (!result[contentId]) result[contentId] = []
      result[contentId].push({
        id: cat.id,
        title: cat.title,
        slug: cat.slug,
        parent_id: cat.parent_id,
        parent_title: cat.parent_id ? parentTitles[cat.parent_id] : undefined
      })
    }

    return { data: result, error: null }
  } catch (error) {
    console.error('Error getting bulk content categories:', error)
    return { data: null, error: 'Failed to get content categories' }
  }
}

/**
 * Get all content assigned to a category
 */
export async function getCategoryContentAction(
  categoryId: string,
  contentType?: ContentType,
  limit?: number
) {
  try {
    const supabase = await createServerSupabaseClient()

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return { data: null, error: 'Authentication required' }
    }

    const { data: category, error: categoryError } = await supabaseAdmin
      .from('categories')
      .select('id, sites!inner(user_id)')
      .eq('id', categoryId)
      .single()

    if (categoryError || !category) {
      return { data: null, error: 'Category not found' }
    }

    if (category.sites[0]?.user_id !== user.id) {
      return { data: null, error: 'Unauthorized' }
    }

    let query = supabaseAdmin
      .from('category_relationships')
      .select('content_id, content_type, created_at')
      .eq('category_id', categoryId)

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

    return { data: relationships as ContentCategoryRelationship[], error: null }
  } catch (error) {
    console.error('Error getting category content:', error)
    return { data: null, error: 'Failed to get category content' }
  }
}

/**
 * Bulk assign multiple categories to content
 */
export async function bulkAssignCategoriesToContentAction(
  contentId: string,
  contentType: ContentType,
  categoryIds: string[]
) {
  try {
    const supabase = await createServerSupabaseClient()

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return { success: false, error: 'Authentication required' }
    }

    const { data: categories, error: categoriesError } = await supabaseAdmin
      .from('categories')
      .select('id, site_id, sites!inner(user_id)')
      .in('id', categoryIds)

    if (categoriesError) {
      return { success: false, error: categoriesError.message }
    }

    if (!categories || categories.length !== categoryIds.length) {
      return { success: false, error: 'One or more categories not found' }
    }

    const unauthorizedCategory = categories.find((c: any) => c.sites.user_id !== user.id)
    if (unauthorizedCategory) {
      return { success: false, error: 'Unauthorized access to one or more categories' }
    }

    const siteIds = new Set(categories.map((c: any) => c.site_id))
    if (siteIds.size > 1) {
      return { success: false, error: 'All categories must belong to the same site' }
    }

    const siteId = categories[0].site_id

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
      return { success: false, error: 'Content and categories must belong to the same site' }
    }

    await supabaseAdmin
      .from('category_relationships')
      .delete()
      .eq('content_id', contentId)
      .eq('content_type', contentType)

    const relationships = categoryIds.map(categoryId => ({
      content_id: contentId,
      content_type: contentType,
      category_id: categoryId
    }))

    const { error: insertError } = await supabaseAdmin
      .from('category_relationships')
      .insert(relationships)

    if (insertError) {
      return { success: false, error: insertError.message }
    }

    revalidateTag('content-categories')
    revalidateTag(`${contentType}-${contentId}`)
    categoryIds.forEach(id => revalidateTag(`category-${id}`))

    return { success: true, error: null }
  } catch (error) {
    console.error('Error bulk assigning categories:', error)
    return { success: false, error: 'Failed to bulk assign categories' }
  }
}

/**
 * Get assignment counts for multiple categories
 */
export async function getCategoryAssignmentCountsAction(categoryIds: string[]) {
  try {
    if (categoryIds.length === 0) return { data: {} as Record<string, number>, error: null }

    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return { data: null, error: 'Authentication required' }
    }

    const { data: relationships, error: relError } = await supabaseAdmin
      .from('category_relationships')
      .select('category_id')
      .in('category_id', categoryIds)

    if (relError) {
      return { data: null, error: relError.message }
    }

    const counts: Record<string, number> = {}
    for (const rel of relationships || []) {
      counts[rel.category_id] = (counts[rel.category_id] || 0) + 1
    }

    return { data: counts, error: null }
  } catch (error) {
    console.error('Error getting category assignment counts:', error)
    return { data: null, error: 'Failed to get assignment counts' }
  }
}

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
