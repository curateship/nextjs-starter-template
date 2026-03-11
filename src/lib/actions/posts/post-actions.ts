'use server'

import { createClient } from '@supabase/supabase-js'
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

export interface PostBlock {
  id: string
  type: 'post-content' | 'image' | 'code' | 'quote' | 'divider' | 'related-posts'
  content: Record<string, any>
  display_order: number
  created_at?: string
  updated_at?: string
}

export interface Post {
  id: string
  site_id: string
  title: string
  slug: string
  meta_description: string | null
  featured_image: string | null
  excerpt: string | null
  content_blocks: Record<string, PostBlock>
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
  featured_image?: string
  excerpt?: string
  content?: string // Add content field
  content_blocks?: Record<string, PostBlock>
  is_published?: boolean
}

export interface UpdatePostData {
  title?: string
  slug?: string
  meta_description?: string
  featured_image?: string
  excerpt?: string
  is_published?: boolean
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

    // Data already includes content_blocks column - no transformation needed
    const transformedData = data || []

    return { data: transformedData as Post[], error: null }
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

    // Get the post to check which site it belongs to
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

    // Data already includes content_blocks column - just normalize dates
    const transformedPost = {
      ...post,
      content_blocks: post.content_blocks || {},
      created_at: post.created_at ? new Date(post.created_at).toISOString() : new Date().toISOString(),
      updated_at: post.updated_at ? new Date(post.updated_at).toISOString() : new Date().toISOString()
    }
    
    return { data: transformedPost as Post, error: null }
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

      // Check if slug conflicts with other posts (excluding current post)
      const { data: existingPost } = await supabaseAdmin
        .from('posts')
        .select('id')
        .eq('site_id', post.site_id)
        .eq('slug', slug)
        .single()
      
      if (existingPost && existingPost.id !== postId) {
        return { 
          data: null, 
          error: `A post with the slug "${slug}" already exists. Please choose a different slug.` 
        }
      }

      processedUpdates.slug = slug
    }

    // Build updates with explicit field whitelist
    const allowedFields = ['title', 'slug', 'meta_description', 'featured_image', 'excerpt', 'is_published'] as const
    const finalPostUpdates: Record<string, any> = {}
    for (const field of allowedFields) {
      if ((processedUpdates as any)[field] !== undefined) {
        if (field === 'title' || field === 'meta_description' || field === 'featured_image' || field === 'excerpt') {
          finalPostUpdates[field] = typeof (processedUpdates as any)[field] === 'string'
            ? (processedUpdates as any)[field].trim() || null
            : (processedUpdates as any)[field]
        } else {
          finalPostUpdates[field] = (processedUpdates as any)[field]
        }
      }
    }

    // Update the post
    const { data, error } = await supabaseAdmin
      .from('posts')
      .update({
        ...finalPostUpdates,
        updated_at: new Date().toISOString()
      })
      .eq('id', postId)
      .select()
      .single()

    if (error) {
      return { data: null, error: `Failed to update post: ${error.message}` }
    }

    return {
      data: data as Post,
      error: null
    }
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

    // Create the duplicate post with content_blocks
    const { data: newPost, error } = await supabaseAdmin
      .from('posts')
      .insert([{
        site_id: originalPost.site_id,
        title: newTitle.trim(),
        slug: newSlug,
        meta_description: originalPost.meta_description,
        featured_image: originalPost.featured_image,
        excerpt: originalPost.excerpt,
        content: originalPost.content,  // Keep for backward compatibility
        content_blocks: originalPost.content_blocks || {},  // Copy content_blocks
        is_published: originalPost.is_published,
        display_order: nextOrder
      }])
      .select()
      .single()

    if (error) {
      return { data: null, error: `Failed to duplicate post: ${error.message}` }
    }

    return { data: newPost as Post, error: null }
  } catch (error) {
    return { 
      data: null, 
      error: `Server error: ${error instanceof Error ? error.message : String(error)}` 
    }
  }
}

/**
 * Get post blocks for a specific post
 */
export async function getPostBlocksAction(postId: string): Promise<{ data: Record<string, PostBlock> | null; error: string | null }> {
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

    // Get content_blocks directly from posts table
    const { data, error } = await supabaseAdmin
      .from('posts')
      .select('content_blocks')
      .eq('id', postId)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        // Post not found
        return { data: null, error: 'Post not found' }
      }
      return { data: null, error: `Failed to fetch post blocks: ${error.message}` }
    }

    return { data: data.content_blocks || {}, error: null }
  } catch (error) {
    return { 
      data: null, 
      error: `Server error: ${error instanceof Error ? error.message : String(error)}` 
    }
  }
}

/**
 * Update post blocks for a specific post
 */
export async function updatePostBlocksAction(postId: string, blocks: Record<string, PostBlock>): Promise<{ success: boolean; error: string | null }> {
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

    // Get the post first
    const { data: post, error: postError } = await supabaseAdmin
      .from('posts')
      .select('id, site_id')
      .eq('id', postId)
      .single()

    if (postError || !post) {
      return { success: false, error: 'Post not found' }
    }

    // Then verify user owns the site this post belongs to
    const { data: site, error: siteError } = await supabaseAdmin
      .from('sites')
      .select('id, user_id')
      .eq('id', post.site_id)
      .eq('user_id', user.id)
      .single()

    if (siteError || !site) {
      return { success: false, error: 'Site not found or access denied' }
    }

    // Get current content_blocks to preserve settings like show_featured_image
    const { data: currentPost } = await supabaseAdmin
      .from('posts')
      .select('content_blocks')
      .eq('id', postId)
      .single()

    // Preserve non-block settings and merge with updated blocks
    const currentContentBlocks = currentPost?.content_blocks || {}
    const preservedSettings: Record<string, any> = {}
    
    // Extract non-block settings (primitive values and objects without block structure)
    Object.entries(currentContentBlocks as Record<string, any>).forEach(([key, value]) => {
      // Preserve primitive values (like show_featured_image: boolean)
      if (typeof value !== 'object' || value === null) {
        preservedSettings[key] = value
      }
      // For objects, check if they're NOT blocks (don't have block structure)
      else if (typeof value === 'object' && !('id' in value && 'type' in value && 'content' in value)) {
        preservedSettings[key] = value
      }
    })

    const updatedContentBlocks = {
      ...preservedSettings,
      ...blocks
    }


    // Update content_blocks directly in the posts table
    const { error: updateError } = await supabaseAdmin
      .from('posts')
      .update({ 
        content_blocks: updatedContentBlocks,
        updated_at: new Date().toISOString()
      })
      .eq('id', postId)
    
    if (updateError) {
      return { success: false, error: `Failed to update post blocks: ${updateError.message}` }
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
 * Add a new block to a post
 */
export async function addPostBlockAction(
  postId: string, 
  blockType: PostBlock['type'], 
  blockContent: Record<string, any>
): Promise<{ data: PostBlock | null; error: string | null }> {
  try {
    // Get current blocks
    const { data: currentBlocks, error: getError } = await getPostBlocksAction(postId)
    if (getError) {
      return { data: null, error: getError }
    }

    // Create new block
    const blockId = `block-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`
    const existingBlocks = Object.values(currentBlocks || {})
    const maxOrder = existingBlocks.length > 0 
      ? Math.max(...existingBlocks.map(b => b.display_order))
      : 0

    const newBlock: PostBlock = {
      id: blockId,
      type: blockType,
      content: blockContent,
      display_order: maxOrder + 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }

    // Update blocks with new block
    const updatedBlocks = {
      ...(currentBlocks || {}),
      [blockId]: newBlock
    }

    const { success, error } = await updatePostBlocksAction(postId, updatedBlocks)
    if (!success) {
      return { data: null, error }
    }

    return { data: newBlock, error: null }
  } catch (error) {
    return { 
      data: null, 
      error: `Server error: ${error instanceof Error ? error.message : String(error)}` 
    }
  }
}

/**
 * Delete a block from a post
 */
export async function deletePostBlockAction(postId: string, blockId: string): Promise<{ success: boolean; error: string | null }> {
  try {
    // Get current blocks
    const { data: currentBlocks, error: getError } = await getPostBlocksAction(postId)
    if (getError) {
      return { success: false, error: getError }
    }

    if (!currentBlocks || !currentBlocks[blockId]) {
      return { success: false, error: 'Block not found' }
    }

    // Remove the block
    const { [blockId]: removed, ...updatedBlocks } = currentBlocks

    const { success, error } = await updatePostBlocksAction(postId, updatedBlocks)
    return { success, error }
  } catch (error) {
    return { 
      success: false, 
      error: `Server error: ${error instanceof Error ? error.message : String(error)}` 
    }
  }
}
