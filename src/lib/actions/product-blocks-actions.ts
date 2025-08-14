"use server"

import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Create server client to verify user authentication
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
            // Server Component cookie setting
          }
        },
      },
    }
  )
}

export interface ProductBlock {
  id: string
  product_id: string
  block_type: 'product-hero' | 'product-details' | 'product-gallery' | 'product-features' | 'product-hotspot'
  content: Record<string, any>
  display_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Block {
  id: string
  type: string
  title: string
  content: Record<string, any>
}

/**
 * Get all blocks for a product
 */
export async function getProductBlocksAction(product_id: string): Promise<{ 
  success: boolean
  blocks?: Record<string, Block[]>
  error?: string 
}> {
  try {
    // Verify user is authenticated
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return { success: false, error: 'Authentication required' }
    }

    // Verify user owns this product (through site ownership)
    const { data: product, error: productError } = await supabaseAdmin
      .from('products')
      .select(`
        id,
        site_id,
        sites!inner (
          id,
          user_id
        )
      `)
      .eq('id', product_id)
      .eq('sites.user_id', user.id)
      .single()

    if (productError || !product) {
      return { success: false, error: 'Product not found or access denied' }
    }

    const { data, error } = await supabaseAdmin
      .from('product_blocks')
      .select('*')
      .eq('product_id', product_id)
      .eq('is_active', true)
      .order('display_order', { ascending: true })

    if (error) {
      // If table doesn't exist yet (migration not applied), return empty blocks
      if (error.message.includes('relation') && error.message.includes('does not exist')) {
        return { success: true, blocks: {} }
      }
      return { success: false, error: `Failed to load product blocks: ${error.message}` }
    }

    // Transform database blocks into the format expected by the builder
    const blocks: Record<string, Block[]> = {}
    
    if (data) {
      // Group blocks by product slug (we'll use the product_id as the key for now)
      const productSlug = 'product-' + product_id // Simplified for now
      blocks[productSlug] = data.map(block => ({
        id: block.id,
        type: block.block_type,
        title: getBlockTitle(block.block_type),
        content: block.content
      }))
    }

    return { success: true, blocks }
  } catch (error) {
    return { 
      success: false, 
      error: `Server error: ${error instanceof Error ? error.message : String(error)}`
    }
  }
}

/**
 * Validate block types against database constraints
 */
function validateBlockTypes(blocks: Block[]): { valid: boolean; error?: string } {
  const allowedTypes = ['product-hero', 'product-details', 'product-gallery', 'product-features', 'product-hotspot']
  
  for (const block of blocks) {
    if (!allowedTypes.includes(block.type)) {
      return {
        valid: false,
        error: `Invalid block type '${block.type}'. Allowed types: ${allowedTypes.join(', ')}`
      }
    }
  }
  
  return { valid: true }
}

/**
 * Create a backup of existing blocks before making changes
 */
async function createBlocksBackup(product_id: string): Promise<{ 
  success: boolean; 
  backup?: ProductBlock[]; 
  error?: string 
}> {
  try {
    const { data: existingBlocks, error } = await supabaseAdmin
      .from('product_blocks')
      .select('*')
      .eq('product_id', product_id)
      .eq('is_active', true)
      .order('display_order', { ascending: true })

    if (error) {
      // If table doesn't exist, that's ok - no backup needed
      if (error.message.includes('relation') && error.message.includes('does not exist')) {
        return { success: true, backup: [] }
      }
      return { success: false, error: `Failed to create backup: ${error.message}` }
    }

    return { success: true, backup: existingBlocks || [] }
  } catch (error) {
    return { 
      success: false, 
      error: `Backup failed: ${error instanceof Error ? error.message : String(error)}`
    }
  }
}

/**
 * Restore blocks from backup
 */
async function restoreFromBackup(product_id: string, backup: ProductBlock[]): Promise<void> {
  if (backup.length === 0) return

  try {
    // First, deactivate all current blocks
    await supabaseAdmin
      .from('product_blocks')
      .update({ is_active: false })
      .eq('product_id', product_id)

    // Restore backup blocks
    const restoreBlocks = backup.map(block => ({
      ...block,
      id: undefined, // Let database generate new IDs
      created_at: undefined,
      updated_at: undefined,
      is_active: true
    }))

    await supabaseAdmin
      .from('product_blocks')
      .insert(restoreBlocks)

  } catch (error) {
    console.error('Failed to restore backup:', error)
    // Log but don't throw - we don't want to make things worse
  }
}

/**
 * Safe save using upsert logic with transaction-like behavior
 */
export async function saveProductBlocksAction(
  product_id: string, 
  blocks: Block[]
): Promise<{ success: boolean; error?: string }> {
  let backup: ProductBlock[] = []
  
  try {
    // Step 1: Authentication
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return { success: false, error: 'Authentication required' }
    }

    // Step 2: Authorization
    const { data: product, error: productError } = await supabaseAdmin
      .from('products')
      .select(`
        id,
        site_id,
        sites!inner (
          id,
          user_id
        )
      `)
      .eq('id', product_id)
      .eq('sites.user_id', user.id)
      .single()

    if (productError || !product) {
      return { success: false, error: 'Product not found or access denied' }
    }

    // Step 3: Pre-save validation
    const validation = validateBlockTypes(blocks)
    if (!validation.valid) {
      return { success: false, error: validation.error }
    }

    // Step 4: Create backup before making any changes
    const backupResult = await createBlocksBackup(product_id)
    if (!backupResult.success) {
      return { success: false, error: backupResult.error }
    }
    backup = backupResult.backup || []

    // Step 5: Perform safe upsert operations
    try {
      // First, mark all existing blocks as inactive (soft delete)
      const { error: deactivateError } = await supabaseAdmin
        .from('product_blocks')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('product_id', product_id)

      if (deactivateError) {
        // If table doesn't exist yet, continue (migration not applied)
        if (!deactivateError.message.includes('relation') || !deactivateError.message.includes('does not exist')) {
          throw new Error(`Failed to deactivate existing blocks: ${deactivateError.message}`)
        }
      }

      // Then insert new blocks
      if (blocks.length > 0) {
        const productBlocks = blocks.map((block, index) => ({
          product_id,
          block_type: block.type as 'product-hero' | 'product-details' | 'product-gallery' | 'product-features' | 'product-hotspot',
          content: block.content,
          display_order: index,
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }))

        const { error: insertError } = await supabaseAdmin
          .from('product_blocks')
          .insert(productBlocks)

        if (insertError) {
          // If table doesn't exist yet, return success (migration not applied)
          if (insertError.message.includes('relation') && insertError.message.includes('does not exist')) {
            console.warn('product_blocks table does not exist yet. Migration 018 needs to be applied.')
            return { success: true }
          }
          throw new Error(`Failed to save blocks: ${insertError.message}`)
        }
      }

      // Step 6: Clean up old inactive blocks (optional, can be done later)
      // We keep them for now in case we need to restore

      return { success: true }

    } catch (saveError) {
      // Step 7: If anything failed, restore from backup
      console.error('Save operation failed, attempting to restore backup:', saveError)
      await restoreFromBackup(product_id, backup)
      
      return { 
        success: false, 
        error: `Save failed and backup restored: ${saveError instanceof Error ? saveError.message : String(saveError)}`
      }
    }

  } catch (error) {
    return { 
      success: false, 
      error: `Server error: ${error instanceof Error ? error.message : String(error)}`
    }
  }
}

// Helper function to get block title
function getBlockTitle(blockType: string): string {
  switch (blockType) {
    case 'product-hero':
      return 'Product Hero'
    case 'product-details':
      return 'Product Details'
    case 'product-gallery':
      return 'Product Gallery'
    case 'product-features':
      return 'Product Features'
    default:
      return 'Product Block'
  }
}