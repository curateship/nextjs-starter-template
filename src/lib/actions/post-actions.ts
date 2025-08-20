'use server'

import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { trackImageUsageAction, getImageByUrlAction, removeImageUsageAction } from './image-actions'

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

export interface Post {
  id: string
  site_id: string
  title: string
  slug: string
  meta_description: string | null
  meta_keywords: string | null
  featured_image: string | null
  excerpt: string | null
  content: string | null
  is_published: boolean
  display_order: number
  created_at: string
  updated_at: string
}

export interface PostWithDetails extends Post {
  site_name: string
  subdomain: string
  user_id: string
  block_count: number
}

export interface CreatePostData {
  title: string
  slug?: string
  meta_description?: string
  meta_keywords?: string
  featured_image?: string
  excerpt?: string
  content?: string
  is_published?: boolean
}

export interface UpdatePostData {
  title?: string
  slug?: string
  meta_description?: string
  meta_keywords?: string
  featured_image?: string
  excerpt?: string
  content?: string
  is_published?: boolean
}

/**
 * Get all posts globally
 */
export async function getAllPostsAction(): Promise<{ data: Post[] | null; error: string | null }> {
  try {
    // Get the authenticated user's ID from the session
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return { data: null, error: 'User not authenticated. Please log in first.' }
    }

    const { data, error } = await supabaseAdmin
      .from('posts')
      .select('*')
      .order('display_order', { ascending: true })

    if (error) {
      // Check if it's a table not found error
      if (error.message.includes('relation') && error.message.includes('does not exist')) {
        // Posts table doesn't exist yet - return empty array
        return { data: [], error: null }
      }
      return { data: null, error: `Failed to fetch posts: ${error.message}` }
    }

    return { data: data as Post[], error: null }
  } catch (error) {
    return { 
      data: null, 
      error: `Server error: ${error instanceof Error ? error.message : String(error)}` 
    }
  }
}

/**
 * Get all posts for a site
 */
export async function getSitePostsAction(siteId: string): Promise<{ data: Post[] | null; error: string | null }> {
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
      .from('posts')
      .select('*')
      .eq('site_id', siteId)
      .order('display_order', { ascending: true })

    if (error) {
      // Check if it's a table not found error
      if (error.message.includes('relation') && error.message.includes('does not exist')) {
        // Posts table doesn't exist yet - return empty array
        return { data: [], error: null }
      }
      return { data: null, error: `Failed to fetch posts: ${error.message}` }
    }

    return { data: data as Post[], error: null }
  } catch (error) {
    return { 
      data: null, 
      error: `Server error: ${error instanceof Error ? error.message : String(error)}` 
    }
  }
}

/**
 * Get a single post by ID
 */
export async function getPostByIdAction(postId: string): Promise<{ data: Post | null; error: string | null }> {
  try {
    // Validate post ID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(postId)) {
      return { data: null, error: 'Invalid post ID format' }
    }

    // Get the authenticated user's ID from the session
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return { data: null, error: 'User not authenticated. Please log in first.' }
    }

    // First get the post to check which site it belongs to
    const { data: post, error: postError } = await supabaseAdmin
      .from('posts')
      .select('*')
      .eq('id', postId)
      .single()

    if (postError) {
      // Check if it's a table not found error
      if (postError.message.includes('relation') && postError.message.includes('does not exist')) {
        return { data: null, error: 'Posts system not yet initialized' }
      }
      
      // Post not found
      if (postError.code === 'PGRST116') {
        return { data: null, error: 'Post not found' }
      }
      
      return { data: null, error: `Failed to fetch post: ${postError.message}` }
    }

    if (!post) {
      return { data: null, error: 'Post not found' }
    }

    // Now verify the user owns the site this post belongs to
    const { data: site, error: siteError } = await supabaseAdmin
      .from('sites')
      .select('id, user_id')
      .eq('id', post.site_id)
      .eq('user_id', user.id)
      .single()

    if (siteError || !site) {
      return { data: null, error: 'Site not found or access denied' }
    }

    // Ensure all dates are properly serialized
    const serializedPost = {
      ...post,
      created_at: post.created_at ? new Date(post.created_at).toISOString() : new Date().toISOString(),
      updated_at: post.updated_at ? new Date(post.updated_at).toISOString() : new Date().toISOString()
    }
    
    return { data: serializedPost, error: null }
  } catch (error) {
    return { 
      data: null, 
      error: `Server error: ${error instanceof Error ? error.message : String(error)}` 
    }
  }
}

/**
 * Create a new global post
 */
export async function createGlobalPostAction(postData: CreatePostData): Promise<{ data: Post | null; error: string | null }> {
  try {
    // Validate required fields
    if (!postData.title?.trim()) {
      return { data: null, error: 'Post title is required' }
    }

    // Get the authenticated user's ID from the session
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return { data: null, error: 'User not authenticated. Please log in first.' }
    }

    // Get the user's first site as the default site for the post
    const { data: sites } = await supabaseAdmin
      .from('sites')
      .select('id')
      .eq('user_id', user.id)
      .limit(1)

    if (!sites || sites.length === 0) {
      return { data: null, error: 'You must have at least one site to create posts' }
    }

    const siteId = sites[0].id

    // Generate slug from title if not provided
    let slug = postData.slug
    if (!slug) {
      slug = postData.title
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

    // Check if slug already exists globally
    const { data: existingPost, error: slugCheckError } = await supabaseAdmin
      .from('posts')
      .select('id')
      .eq('slug', slug)
      .single()

    if (slugCheckError && slugCheckError.code !== 'PGRST116') {
      return { data: null, error: 'Failed to validate slug uniqueness' }
    }

    if (existingPost) {
      return { data: null, error: 'A post with this slug already exists' }
    }

    // Get the next display order
    const { data: orderData } = await supabaseAdmin
      .from('posts')
      .select('display_order')
      .order('display_order', { ascending: false })
      .limit(1)

    const nextOrder = orderData && orderData.length > 0 ? orderData[0].display_order + 1 : 1

    // Create the post
    const { data, error } = await supabaseAdmin
      .from('posts')
      .insert([{
        site_id: siteId, // Use the user's first site
        title: postData.title.trim(),
        slug,
        meta_description: postData.meta_description?.trim() || null,
        meta_keywords: postData.meta_keywords?.trim() || null,
        featured_image: postData.featured_image?.trim() || null,
        excerpt: postData.excerpt?.trim() || null,
        content: postData.content?.trim() || null,
        is_published: postData.is_published !== false,
        display_order: nextOrder
      }])
      .select()
      .single()

    if (error) {
      return { data: null, error: `Failed to create post: ${error.message}` }
    }

    return { data: data as Post, error: null }
  } catch (error) {
    return { 
      data: null, 
      error: `Server error: ${error instanceof Error ? error.message : String(error)}` 
    }
  }
}

/**
 * Create a new post for a site
 */
export async function createPostAction(siteId: string, postData: CreatePostData): Promise<{ data: Post | null; error: string | null }> {
  try {
    // Validate site ID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(siteId)) {
      return { data: null, error: 'Invalid site ID format' }
    }

    // Validate required fields
    if (!postData.title?.trim()) {
      return { data: null, error: 'Post title is required' }
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
    let slug = postData.slug
    if (!slug) {
      slug = postData.title
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
    const { data: existingPost, error: slugCheckError } = await supabaseAdmin
      .from('posts')
      .select('id')
      .eq('site_id', siteId)
      .eq('slug', slug)
      .single()

    if (slugCheckError && slugCheckError.code !== 'PGRST116') {
      return { data: null, error: 'Failed to validate slug uniqueness' }
    }

    if (existingPost) {
      return { data: null, error: 'A post with this slug already exists' }
    }

    // Get the next display order
    const { data: orderData } = await supabaseAdmin
      .from('posts')
      .select('display_order')
      .eq('site_id', siteId)
      .order('display_order', { ascending: false })
      .limit(1)

    const nextOrder = orderData && orderData.length > 0 ? orderData[0].display_order + 1 : 1

    // Create the post
    const { data, error } = await supabaseAdmin
      .from('posts')
      .insert([{
        site_id: siteId,
        title: postData.title.trim(),
        slug,
        meta_description: postData.meta_description?.trim() || null,
        meta_keywords: postData.meta_keywords?.trim() || null,
        featured_image: postData.featured_image?.trim() || null,
        excerpt: postData.excerpt?.trim() || null,
        content: postData.content?.trim() || null,
        is_published: postData.is_published !== false,
        display_order: nextOrder
      }])
      .select()
      .single()

    if (error) {
      return { data: null, error: `Failed to create post: ${error.message}` }
    }

    // Track featured image usage if post has one and is published
    if (data.featured_image && data.is_published) {
      const { data: imageId } = await getImageByUrlAction(data.featured_image)
      if (imageId) {
        await trackImageUsageAction(imageId, siteId, "post", "featured-image")
      }
    }

    return { data: data as Post, error: null }
  } catch (error) {
    return { 
      data: null, 
      error: `Server error: ${error instanceof Error ? error.message : String(error)}` 
    }
  }
}

/**
 * Update an existing post
 */
export async function updatePostAction(postId: string, updates: UpdatePostData): Promise<{ data: Post | null; error: string | null }> {
  try {
    // Validate post ID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(postId)) {
      return { data: null, error: 'Invalid post ID format' }
    }

    // Get the authenticated user's ID from the session
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return { data: null, error: 'User not authenticated. Please log in first.' }
    }

    // Get the post
    const { data: post, error: postError } = await supabaseAdmin
      .from('posts')
      .select('*')
      .eq('id', postId)
      .single()

    if (postError || !post) {
      return { data: null, error: 'Post not found' }
    }

    // Verify user owns the site this post belongs to
    const { data: site, error: siteError } = await supabaseAdmin
      .from('sites')
      .select('id, user_id')
      .eq('id', post.site_id)
      .eq('user_id', user.id)
      .single()

    if (siteError || !site) {
      return { data: null, error: 'Site not found or access denied' }
    }

    // Validate title if being updated
    if (updates.title !== undefined && !updates.title?.trim()) {
      return { data: null, error: 'Post title cannot be empty' }
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

      // Check if slug already exists for this site (excluding current post)
      const { data: existingPost } = await supabaseAdmin
        .from('posts')
        .select('id')
        .eq('site_id', post.site_id)
        .eq('slug', slug)
        .neq('id', postId)
        .single()

      if (existingPost) {
        return { data: null, error: 'A post with this slug already exists' }
      }

      processedUpdates.slug = slug
    }

    // Clean up the updates object
    const finalUpdates: any = {}
    Object.entries(processedUpdates).forEach(([key, value]) => {
      if (value !== undefined) {
        if (key === 'title' || key === 'meta_description' || key === 'meta_keywords' || key === 'featured_image' || key === 'excerpt' || key === 'content') {
          finalUpdates[key] = typeof value === 'string' ? value.trim() || null : value
        } else {
          finalUpdates[key] = value
        }
      }
    })

    // Update the post
    const { data, error } = await supabaseAdmin
      .from('posts')
      .update({
        ...finalUpdates,
        updated_at: new Date().toISOString()
      })
      .eq('id', postId)
      .select()
      .single()

    if (error) {
      return { data: null, error: `Failed to update post: ${error.message}` }
    }

    // Only track image usage if featured_image was actually updated
    if (updates.featured_image !== undefined) {
      // Remove old usage tracking if there was a previous image
      if (post.featured_image) {
        const { data: oldImageId } = await getImageByUrlAction(post.featured_image)
        if (oldImageId) {
          await removeImageUsageAction(oldImageId, post.site_id, "post", "featured-image")
        }
      }
      
      // Add new usage tracking if new image exists and post is published
      if (data.featured_image && data.is_published) {
        const { data: imageId } = await getImageByUrlAction(data.featured_image)
        if (imageId) {
          await trackImageUsageAction(imageId, post.site_id, "post", "featured-image")
        }
      }
    }

    return { data: data as Post, error: null }
  } catch (error) {
    return { 
      data: null, 
      error: `Server error: ${error instanceof Error ? error.message : String(error)}` 
    }
  }
}

/**
 * Delete a post
 */
export async function deletePostAction(postId: string): Promise<{ success: boolean; error: string | null }> {
  try {
    // Validate post ID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(postId)) {
      return { success: false, error: 'Invalid post ID format' }
    }

    // Get the authenticated user's ID from the session
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return { success: false, error: 'User not authenticated. Please log in first.' }
    }

    // Get the post
    const { data: post, error: postError } = await supabaseAdmin
      .from('posts')
      .select('*')
      .eq('id', postId)
      .single()

    if (postError || !post) {
      return { success: false, error: 'Post not found' }
    }

    // Verify user owns the site this post belongs to
    const { data: site, error: siteError } = await supabaseAdmin
      .from('sites')
      .select('id, user_id')
      .eq('id', post.site_id)
      .eq('user_id', user.id)
      .single()

    if (siteError || !site) {
      return { success: false, error: 'Site not found or access denied' }
    }

    // Delete associated blocks first (cleanup orphaned blocks)
    const { error: blockDeleteError } = await supabaseAdmin
      .from('page_blocks')
      .delete()
      .eq('site_id', post.site_id)
      .eq('page_slug', `post-${post.slug}`)

    if (blockDeleteError) {
      console.warn('Failed to delete associated blocks:', blockDeleteError.message)
      // Continue with post deletion even if block cleanup fails
    }

    // Remove featured image usage tracking if post has an image
    if (post.featured_image) {
      const { data: imageId } = await getImageByUrlAction(post.featured_image)
      if (imageId) {
        await removeImageUsageAction(imageId, post.site_id, "post", "featured-image")
      }
    }

    // Delete the post
    const { error } = await supabaseAdmin
      .from('posts')
      .delete()
      .eq('id', postId)

    if (error) {
      return { success: false, error: `Failed to delete post: ${error.message}` }
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
 * Duplicate a post
 */
export async function duplicatePostAction(postId: string, newTitle: string): Promise<{ data: Post | null; error: string | null }> {
  try {
    // Validate post ID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(postId)) {
      return { data: null, error: 'Invalid post ID format' }
    }

    if (!newTitle?.trim()) {
      return { data: null, error: 'New post title is required' }
    }

    // Get the authenticated user's ID from the session
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return { data: null, error: 'User not authenticated. Please log in first.' }
    }

    // Get the original post
    const { data: originalPost, error: postError } = await supabaseAdmin
      .from('posts')
      .select('*')
      .eq('id', postId)
      .single()

    if (postError || !originalPost) {
      return { data: null, error: 'Post not found' }
    }

    // Verify user owns the site this post belongs to
    const { data: site, error: siteError } = await supabaseAdmin
      .from('sites')
      .select('id, user_id')
      .eq('id', originalPost.site_id)
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
      const { data: existingPost } = await supabaseAdmin
        .from('posts')
        .select('id')
        .eq('site_id', originalPost.site_id)
        .eq('slug', newSlug)
        .single()

      if (!existingPost) break

      newSlug = `${baseSlug}-${counter}`
      counter++
    }

    // Get the next display order
    const { data: orderData } = await supabaseAdmin
      .from('posts')
      .select('display_order')
      .eq('site_id', originalPost.site_id)
      .order('display_order', { ascending: false })
      .limit(1)

    const nextOrder = orderData && orderData.length > 0 ? orderData[0].display_order + 1 : 1

    // Create the duplicate post
    const { data: newPost, error } = await supabaseAdmin
      .from('posts')
      .insert([{
        site_id: originalPost.site_id,
        title: newTitle.trim(),
        slug: newSlug,
        meta_description: originalPost.meta_description,
        meta_keywords: originalPost.meta_keywords,
        featured_image: originalPost.featured_image,
        excerpt: originalPost.excerpt,
        content: originalPost.content,
        is_published: originalPost.is_published,
        display_order: nextOrder
      }])
      .select()
      .single()

    if (error) {
      return { data: null, error: `Failed to duplicate post: ${error.message}` }
    }

    // Copy all blocks from the original post to the new post
    const { data: originalBlocks } = await supabaseAdmin
      .from('page_blocks')
      .select('*')
      .eq('site_id', originalPost.site_id)
      .eq('page_slug', `post-${originalPost.slug}`)

    if (originalBlocks && originalBlocks.length > 0) {
      const duplicatedBlocks = originalBlocks.map(block => ({
        site_id: block.site_id,
        block_type: block.block_type,
        page_slug: `post-${newSlug}`,
        content: block.content,
        display_order: block.display_order
      }))

      await supabaseAdmin
        .from('page_blocks')
        .insert(duplicatedBlocks)
    }

    // Track featured image usage if the new post has one and is published
    if (newPost.featured_image && newPost.is_published) {
      const { data: imageId } = await getImageByUrlAction(newPost.featured_image)
      if (imageId) {
        await trackImageUsageAction(imageId, originalPost.site_id, "post", "featured-image")
      }
    }

    return { data: newPost as Post, error: null }
  } catch (error) {
    return { 
      data: null, 
      error: `Server error: ${error instanceof Error ? error.message : String(error)}` 
    }
  }
}