'use server'

import { createClient } from '@supabase/supabase-js'
import { revalidateTag } from 'next/cache'
import { applyDefaultBlocks } from '@/lib/utils/default-blocks'
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

export interface Category {
  id: string
  site_id: string
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

export interface CreateCategoryData {
  title: string
  slug?: string
  parent_id?: string | null
  featured_image?: string | null
  description?: string | null
  meta_description?: string | null
  content_blocks?: Record<string, any>
  is_published?: boolean
}

export interface UpdateCategoryData {
  title?: string
  slug?: string
  parent_id?: string | null
  featured_image?: string | null
  description?: string | null
  meta_description?: string | null
  content_blocks?: Record<string, any>
  is_published?: boolean
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
 * Get all categories for a site
 */
export async function getCategoriesForSiteAction(siteId: string, options?: { page?: number; pageSize?: number }) {
  try {
    const supabase = await createServerSupabaseClient()

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return { data: null, total: 0, error: 'Authentication required' }
    }

    const { data: site, error: siteError } = await supabaseAdmin
      .from('sites')
      .select('id, user_id')
      .eq('id', siteId)
      .single()

    if (siteError || !site) {
      return { data: null, total: 0, error: 'Site not found' }
    }

    if (site.user_id !== user.id) {
      return { data: null, total: 0, error: 'Unauthorized' }
    }

    // Pagination
    const page = Math.max(1, Math.floor(options?.page ?? 1))
    const pageSize = Math.min(100, Math.max(1, Math.floor(options?.pageSize ?? 50)))
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    const { data: categories, count, error: categoriesError } = await supabaseAdmin
      .from('categories')
      .select('*', { count: 'exact' })
      .eq('site_id', siteId)
      .order('display_order', { ascending: false })
      .range(from, to)

    if (categoriesError) {
      return { data: null, total: 0, error: categoriesError.message }
    }

    return { data: categories as Category[], total: count ?? 0, error: null }
  } catch (error) {
    console.error('Error fetching categories:', error)
    return { data: null, total: 0, error: 'Failed to fetch categories' }
  }
}

/**
 * Get categories with assignment counts in a single action (1 auth check, parallel queries)
 */
export async function getCategoriesWithCountsAction(siteId: string, options?: { page?: number; pageSize?: number }) {
  try {
    const supabase = await createServerSupabaseClient()

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return { data: null, total: 0, counts: {} as Record<string, number>, error: 'Authentication required' }
    }

    const { data: site, error: siteError } = await supabaseAdmin
      .from('sites')
      .select('id, user_id')
      .eq('id', siteId)
      .single()

    if (siteError || !site) {
      return { data: null, total: 0, counts: {} as Record<string, number>, error: 'Site not found' }
    }

    if (site.user_id !== user.id) {
      return { data: null, total: 0, counts: {} as Record<string, number>, error: 'Unauthorized' }
    }

    // Pagination
    const page = Math.max(1, Math.floor(options?.page ?? 1))
    const pageSize = Math.min(100, Math.max(1, Math.floor(options?.pageSize ?? 50)))
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    // Fetch paginated categories
    const categoriesResult = await supabaseAdmin
      .from('categories')
      .select('id, title, slug, parent_id, featured_image, description, is_published, display_order, created_at, updated_at', { count: 'exact' })
      .eq('site_id', siteId)
      .order('display_order', { ascending: false })
      .range(from, to)

    if (categoriesResult.error) {
      return { data: null, total: 0, counts: {} as Record<string, number>, error: categoriesResult.error.message }
    }

    // Fetch assignment counts for the returned categories
    const counts: Record<string, number> = {}
    const categoryIds = (categoriesResult.data || []).map(c => c.id)
    if (categoryIds.length > 0) {
      const { data: relationships } = await supabaseAdmin
        .from('category_relationships')
        .select('category_id')
        .in('category_id', categoryIds)

      if (relationships) {
        for (const rel of relationships) {
          counts[rel.category_id] = (counts[rel.category_id] || 0) + 1
        }
      }
    }

    return {
      data: categoriesResult.data as Category[],
      total: categoriesResult.count ?? 0,
      counts,
      error: null
    }
  } catch (error) {
    console.error('Error fetching categories with counts:', error)
    return { data: null, total: 0, counts: {} as Record<string, number>, error: 'Failed to fetch categories' }
  }
}

/**
 * Create a new category
 */
export async function createCategoryAction(
  siteId: string,
  data: CreateCategoryData
) {
  try {
    const supabase = await createServerSupabaseClient()

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return { data: null, error: 'Authentication required' }
    }

    const { data: site, error: siteError } = await supabaseAdmin
      .from('sites')
      .select('id, user_id, settings')
      .eq('id', siteId)
      .single()

    if (siteError || !site) {
      return { data: null, error: 'Site not found' }
    }

    if (site.user_id !== user.id) {
      return { data: null, error: 'Unauthorized' }
    }

    // Generate slug if not provided
    const slug = data.slug || generateSlug(data.title)

    // Check if slug already exists for this site
    const { data: existingCategory } = await supabaseAdmin
      .from('categories')
      .select('id')
      .eq('site_id', siteId)
      .eq('slug', slug)
      .single()

    if (existingCategory) {
      return { data: null, error: 'A category with this slug already exists' }
    }

    // If parent_id is provided, verify it exists and belongs to the same site
    if (data.parent_id) {
      const { data: parentCategory, error: parentError } = await supabaseAdmin
        .from('categories')
        .select('id')
        .eq('id', data.parent_id)
        .eq('site_id', siteId)
        .single()

      if (parentError || !parentCategory) {
        return { data: null, error: 'Parent category not found' }
      }
    }

    // Get the highest display_order
    const { data: maxOrderCategory } = await supabaseAdmin
      .from('categories')
      .select('display_order')
      .eq('site_id', siteId)
      .order('display_order', { ascending: false })
      .limit(1)
      .single()

    const nextDisplayOrder = maxOrderCategory ? maxOrderCategory.display_order + 1 : 0

    // Create the category
    const { data: newCategory, error: createError } = await supabaseAdmin
      .from('categories')
      .insert({
        site_id: siteId,
        title: data.title,
        slug,
        parent_id: data.parent_id || null,
        featured_image: data.featured_image || null,
        description: data.description || null,
        meta_description: data.meta_description || null,
        content_blocks: applyDefaultBlocks(data.content_blocks, 'categories', (site as any).settings?.default_blocks?.categories),
        is_published: data.is_published ?? false,
        display_order: nextDisplayOrder
      })
      .select()
      .single()

    if (createError) {
      return { data: null, error: createError.message }
    }

    revalidateTag('categories')
    revalidateTag(`site-${siteId}`)

    return { data: newCategory as Category, error: null }
  } catch (error) {
    console.error('Error creating category:', error)
    return { data: null, error: 'Failed to create category' }
  }
}

/**
 * Update a category
 */
export async function updateCategoryAction(categoryId: string, data: UpdateCategoryData) {
  try {
    // Validate category ID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(categoryId)) {
      return { data: null, error: 'Invalid category ID format' }
    }

    const supabase = await createServerSupabaseClient()

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return { data: null, error: 'Authentication required' }
    }

    const { data: category, error: categoryError } = await supabaseAdmin
      .from('categories')
      .select('*, sites!inner(user_id)')
      .eq('id', categoryId)
      .single()

    if (categoryError || !category) {
      return { data: null, error: 'Category not found' }
    }

    if (category.sites.user_id !== user.id) {
      return { data: null, error: 'Unauthorized' }
    }

    // Validate and process slug if being updated
    if (data.slug !== undefined) {
      const slug = data.slug.trim()

      if (!/^[a-zA-Z0-9_-]+$/.test(slug)) {
        return { data: null, error: 'Invalid slug format. Use only letters, numbers, hyphens, and underscores.' }
      }

      const reservedSlugs = ['api', 'admin', 'www', 'mail', 'ftp', 'global']
      if (reservedSlugs.includes(slug.toLowerCase())) {
        return { data: null, error: 'This slug is reserved and cannot be used.' }
      }

      if (slug !== category.slug) {
        const { data: existingCategory } = await supabaseAdmin
          .from('categories')
          .select('id')
          .eq('site_id', category.site_id)
          .eq('slug', slug)
          .neq('id', categoryId)
          .single()

        if (existingCategory) {
          return { data: null, error: 'A category with this slug already exists' }
        }
      }
    }

    // If parent_id is being updated, verify it exists and prevent circular references
    if (data.parent_id !== undefined) {
      if (data.parent_id === categoryId) {
        return { data: null, error: 'A category cannot be its own parent' }
      }

      if (data.parent_id) {
        const { data: parentCategory, error: parentError } = await supabaseAdmin
          .from('categories')
          .select('id, parent_id')
          .eq('id', data.parent_id)
          .eq('site_id', category.site_id)
          .single()

        if (parentError || !parentCategory) {
          return { data: null, error: 'Parent category not found' }
        }

        // Check for circular reference
        if (parentCategory.parent_id === categoryId) {
          return { data: null, error: 'Circular parent relationship detected' }
        }
      }
    }

    // Build updates with explicit field whitelist
    const allowedFields = ['title', 'slug', 'parent_id', 'is_published', 'featured_image', 'description', 'meta_description', 'content_blocks'] as const
    const finalUpdates: Record<string, any> = {}
    for (const field of allowedFields) {
      if ((data as any)[field] !== undefined) {
        if (field === 'title' || field === 'description' || field === 'meta_description' || field === 'featured_image') {
          finalUpdates[field] = typeof (data as any)[field] === 'string'
            ? (data as any)[field].trim() || null
            : (data as any)[field]
        } else {
          finalUpdates[field] = (data as any)[field]
        }
      }
    }

    const { data: updatedCategory, error: updateError } = await supabaseAdmin
      .from('categories')
      .update({
        ...finalUpdates,
        updated_at: new Date().toISOString()
      })
      .eq('id', categoryId)
      .select()
      .single()

    if (updateError) {
      return { data: null, error: updateError.message }
    }

    revalidateTag('categories')
    revalidateTag(`category-${categoryId}`)
    revalidateTag(`site-${category.site_id}`)

    return { data: updatedCategory as Category, error: null }
  } catch (error) {
    console.error('Error updating category:', error)
    return { data: null, error: 'Failed to update category' }
  }
}

/**
 * Delete a category
 */
export async function deleteCategoryAction(categoryId: string) {
  try {
    // Validate category ID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(categoryId)) {
      return { success: false, error: 'Invalid category ID format' }
    }

    const supabase = await createServerSupabaseClient()

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return { success: false, error: 'Authentication required' }
    }

    const { data: category, error: categoryError } = await supabaseAdmin
      .from('categories')
      .select('*, sites!inner(user_id)')
      .eq('id', categoryId)
      .single()

    if (categoryError || !category) {
      return { success: false, error: 'Category not found' }
    }

    if (category.sites.user_id !== user.id) {
      return { success: false, error: 'Unauthorized' }
    }

    // Collect all descendant IDs (children, grandchildren, etc.)
    const allIdsToDelete = [categoryId]
    const queue = [categoryId]

    while (queue.length > 0) {
      const parentId = queue.shift()!
      const { data: children, error: childrenError } = await supabaseAdmin
        .from('categories')
        .select('id')
        .eq('parent_id', parentId)

      if (childrenError) {
        return { success: false, error: childrenError.message }
      }

      if (children) {
        for (const child of children) {
          allIdsToDelete.push(child.id)
          queue.push(child.id)
        }
      }
    }

    // Delete all content relationships for these categories
    const { error: relDeleteError } = await supabaseAdmin
      .from('category_relationships')
      .delete()
      .in('category_id', allIdsToDelete)

    if (relDeleteError) {
      return { success: false, error: relDeleteError.message }
    }

    // Delete all categories (children first, then parent)
    const { error: deleteError } = await supabaseAdmin
      .from('categories')
      .delete()
      .in('id', allIdsToDelete)

    if (deleteError) {
      return { success: false, error: deleteError.message }
    }

    revalidateTag('categories')
    revalidateTag(`category-${categoryId}`)
    revalidateTag(`site-${category.site_id}`)

    return { success: true, error: null }
  } catch (error) {
    console.error('Error deleting category:', error)
    return { success: false, error: 'Failed to delete category' }
  }
}

/**
 * Delete multiple categories at once (with cascading child deletion)
 */
export async function deleteCategoriesAction(categoryIds: string[]): Promise<{ success: boolean; error: string | null }> {
  try {
    if (!categoryIds.length) {
      return { success: false, error: 'No categories selected' }
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    for (const id of categoryIds) {
      if (!uuidRegex.test(id)) {
        return { success: false, error: 'Invalid category ID format' }
      }
    }

    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return { success: false, error: 'Authentication required' }
    }

    // Fetch all selected categories and verify ownership
    const { data: categories, error: categoriesError } = await supabaseAdmin
      .from('categories')
      .select('id, site_id')
      .in('id', categoryIds)

    if (categoriesError || !categories?.length) {
      return { success: false, error: 'Categories not found' }
    }

    const siteIds = [...new Set(categories.map(c => c.site_id))]
    const { data: sites, error: sitesError } = await supabaseAdmin
      .from('sites')
      .select('id')
      .in('id', siteIds)
      .eq('user_id', user.id)

    if (sitesError || !sites?.length || sites.length !== siteIds.length) {
      return { success: false, error: 'Access denied to one or more categories' }
    }

    // Collect all IDs to delete including descendants
    const allIdsToDelete = new Set(categoryIds)
    const queue = [...categoryIds]

    while (queue.length > 0) {
      const parentId = queue.shift()!
      const { data: children } = await supabaseAdmin
        .from('categories')
        .select('id')
        .eq('parent_id', parentId)

      if (children) {
        for (const child of children) {
          if (!allIdsToDelete.has(child.id)) {
            allIdsToDelete.add(child.id)
            queue.push(child.id)
          }
        }
      }
    }

    const idsArray = Array.from(allIdsToDelete)

    // Delete all content relationships
    const { error: relDeleteError } = await supabaseAdmin
      .from('category_relationships')
      .delete()
      .in('category_id', idsArray)

    if (relDeleteError) {
      return { success: false, error: relDeleteError.message }
    }

    // Delete all categories
    const { error: deleteError } = await supabaseAdmin
      .from('categories')
      .delete()
      .in('id', idsArray)

    if (deleteError) {
      return { success: false, error: deleteError.message }
    }

    revalidateTag('categories')

    return { success: true, error: null }
  } catch (error) {
    return {
      success: false,
      error: `Server error: ${error instanceof Error ? error.message : String(error)}`
    }
  }
}

/**
 * Update category blocks (for builder)
 */
export async function updateCategoryBlocksAction(categoryId: string, contentBlocks: Record<string, any>) {
  try {
    // Validate category ID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(categoryId)) {
      return { success: false, error: 'Invalid category ID format' }
    }

    const supabase = await createServerSupabaseClient()

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return { success: false, error: 'Authentication required' }
    }

    const { data: category, error: categoryError } = await supabaseAdmin
      .from('categories')
      .select('*, sites!inner(user_id)')
      .eq('id', categoryId)
      .single()

    if (categoryError || !category) {
      return { success: false, error: 'Category not found' }
    }

    if (category.sites.user_id !== user.id) {
      return { success: false, error: 'Unauthorized' }
    }

    const { error: updateError } = await supabaseAdmin
      .from('categories')
      .update({
        content_blocks: contentBlocks,
        updated_at: new Date().toISOString()
      })
      .eq('id', categoryId)

    if (updateError) {
      return { success: false, error: updateError.message }
    }

    revalidateTag('categories')
    revalidateTag(`category-${categoryId}`)
    revalidateTag(`site-${category.site_id}`)

    return { success: true, error: null }
  } catch (error) {
    console.error('Error updating category blocks:', error)
    return { success: false, error: 'Failed to update category blocks' }
  }
}

