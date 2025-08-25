'use server'

import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

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

export interface PostBlock {
  id: string
  type: 'rich-text' | 'post-content' | 'image' | 'code' | 'quote' | 'divider'
  content: Record<string, any>
  display_order: number
  created_at?: string
  updated_at?: string
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

    // Verify user owns the post
    const { data: post, error: postError } = await supabaseAdmin
      .from('posts')
      .select('id, site_id, sites!inner(user_id)')
      .eq('id', postId)
      .single()

    if (postError || !post) {
      return { success: false, error: 'Post not found or access denied' }
    }

    if (post.sites[0]?.user_id !== user.id) {
      return { success: false, error: 'Access denied - you do not own this post' }
    }

    // Update content_blocks directly in the posts table
    const { error: updateError } = await supabaseAdmin
      .from('posts')
      .update({ 
        content_blocks: blocks,
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
    const blockId = `block-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
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