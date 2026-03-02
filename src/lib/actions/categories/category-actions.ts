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
          }
        },
      },
    }
  )
}

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

export interface CategoryWithDetails extends Category {
  site_name: string
  subdomain: string
  user_id: string
  parent_title?: string
  children_count?: number
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
 * Get all categories for a site
 */
export async function getCategoriesForSiteAction(siteId: string) {
  try {
    const supabase = await createServerSupabaseClient()

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return { data: null, error: 'Authentication required' }
    }

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

    const { data: categories, error: categoriesError } = await supabaseAdmin
      .from('categories')
      .select('*')
      .eq('site_id', siteId)
      .order('display_order', { ascending: true })
      .order('title', { ascending: true })

    if (categoriesError) {
      return { data: null, error: categoriesError.message }
    }

    return { data: categories as Category[], error: null }
  } catch (error) {
    console.error('Error fetching categories:', error)
    return { data: null, error: 'Failed to fetch categories' }
  }
}

/**
 * Get a single category by ID
 */
export async function getCategoryByIdAction(categoryId: string) {
  try {
    const supabase = await createServerSupabaseClient()

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return { data: null, error: 'Authentication required' }
    }

    const { data: category, error: categoryError } = await supabaseAdmin
      .from('categories')
      .select('*, sites!inner(user_id, name, subdomain)')
      .eq('id', categoryId)
      .single()

    if (categoryError || !category) {
      return { data: null, error: 'Category not found' }
    }

    if (category.sites.user_id !== user.id) {
      return { data: null, error: 'Unauthorized' }
    }

    const categoryWithDetails: CategoryWithDetails = {
      ...category,
      site_name: category.sites.name,
      subdomain: category.sites.subdomain,
      user_id: category.sites.user_id,
    }

    return { data: categoryWithDetails, error: null }
  } catch (error) {
    console.error('Error fetching category:', error)
    return { data: null, error: 'Failed to fetch category' }
  }
}

/**
 * Get a category by slug
 */
export async function getCategoryBySlugAction(siteId: string, slug: string) {
  try {
    const supabase = await createServerSupabaseClient()

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return { data: null, error: 'Authentication required' }
    }

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

    const { data: category, error: categoryError } = await supabaseAdmin
      .from('categories')
      .select('*')
      .eq('site_id', siteId)
      .eq('slug', slug)
      .single()

    if (categoryError || !category) {
      return { data: null, error: 'Category not found' }
    }

    return { data: category as Category, error: null }
  } catch (error) {
    console.error('Error fetching category by slug:', error)
    return { data: null, error: 'Failed to fetch category' }
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
        content_blocks: data.content_blocks || {},
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

    // If slug is being updated, check if it's already taken
    if (data.slug && data.slug !== category.slug) {
      const { data: existingCategory } = await supabaseAdmin
        .from('categories')
        .select('id')
        .eq('site_id', category.site_id)
        .eq('slug', data.slug)
        .neq('id', categoryId)
        .single()

      if (existingCategory) {
        return { data: null, error: 'A category with this slug already exists' }
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

    const { data: updatedCategory, error: updateError } = await supabaseAdmin
      .from('categories')
      .update({
        ...data,
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
 * Update category blocks (for builder)
 */
export async function updateCategoryBlocksAction(categoryId: string, contentBlocks: Record<string, any>) {
  try {
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

    const { data: updatedCategory, error: updateError } = await supabaseAdmin
      .from('categories')
      .update({
        content_blocks: contentBlocks,
        updated_at: new Date().toISOString()
      })
      .eq('id', categoryId)
      .select()
      .single()

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

/**
 * Duplicate a category
 */
export async function duplicateCategoryAction(categoryId: string, newTitle: string) {
  try {
    const supabase = await createServerSupabaseClient()

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return { data: null, error: 'Authentication required' }
    }

    const { data: originalCategory, error: categoryError } = await supabaseAdmin
      .from('categories')
      .select('*, sites!inner(user_id)')
      .eq('id', categoryId)
      .single()

    if (categoryError || !originalCategory) {
      return { data: null, error: 'Category not found' }
    }

    if (originalCategory.sites.user_id !== user.id) {
      return { data: null, error: 'Unauthorized' }
    }

    // Generate a unique slug for the duplicate
    const baseSlug = generateSlug(newTitle)
    let slug = baseSlug
    let counter = 1

    while (true) {
      const { data: existingCategory } = await supabaseAdmin
        .from('categories')
        .select('id')
        .eq('site_id', originalCategory.site_id)
        .eq('slug', slug)
        .single()

      if (!existingCategory) break
      slug = `${baseSlug}-${counter}`
      counter++
    }

    const { data: maxOrderCategory } = await supabaseAdmin
      .from('categories')
      .select('display_order')
      .eq('site_id', originalCategory.site_id)
      .order('display_order', { ascending: false })
      .limit(1)
      .single()

    const nextDisplayOrder = maxOrderCategory ? maxOrderCategory.display_order + 1 : 0

    const { data: newCategory, error: createError } = await supabaseAdmin
      .from('categories')
      .insert({
        site_id: originalCategory.site_id,
        title: newTitle,
        slug,
        parent_id: originalCategory.parent_id,
        featured_image: originalCategory.featured_image,
        description: originalCategory.description,
        meta_description: originalCategory.meta_description,
        content_blocks: originalCategory.content_blocks || {},
        is_published: false,
        display_order: nextDisplayOrder
      })
      .select()
      .single()

    if (createError) {
      return { data: null, error: createError.message }
    }

    revalidateTag('categories')
    revalidateTag(`site-${originalCategory.site_id}`)

    return { data: newCategory as Category, error: null }
  } catch (error) {
    console.error('Error duplicating category:', error)
    return { data: null, error: 'Failed to duplicate category' }
  }
}
