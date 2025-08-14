"use server"

import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
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
            // Server Component cookie setting
          }
        },
      },
    }
  )
}

/**
 * Clean up old inactive product blocks (older than 30 days)
 * Only for authenticated administrators
 */
export async function cleanupOldProductBlocksAction(): Promise<{ 
  success: boolean
  deletedCount?: number
  error?: string 
}> {
  try {
    // Verify user is authenticated
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return { success: false, error: 'Authentication required' }
    }

    // Call the cleanup function
    const { data, error } = await supabaseAdmin
      .rpc('cleanup_old_product_blocks')

    if (error) {
      return { success: false, error: `Cleanup failed: ${error.message}` }
    }

    return { 
      success: true, 
      deletedCount: data || 0
    }
  } catch (error) {
    return { 
      success: false, 
      error: `Cleanup error: ${error instanceof Error ? error.message : String(error)}`
    }
  }
}

/**
 * Get statistics about product blocks storage
 */
export async function getProductBlocksStatsAction(): Promise<{ 
  success: boolean
  stats?: {
    totalBlocks: number
    activeBlocks: number
    inactiveBlocks: number
    oldInactiveBlocks: number
  }
  error?: string 
}> {
  try {
    // Verify user is authenticated
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return { success: false, error: 'Authentication required' }
    }

    // Get counts for different block states
    const [totalResult, activeResult, inactiveResult, oldInactiveResult] = await Promise.all([
      supabaseAdmin.from('product_blocks').select('*', { count: 'exact', head: true }),
      supabaseAdmin.from('product_blocks').select('*', { count: 'exact', head: true }).eq('is_active', true),
      supabaseAdmin.from('product_blocks').select('*', { count: 'exact', head: true }).eq('is_active', false),
      supabaseAdmin.from('product_blocks')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', false)
        .lt('deleted_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
    ])

    if (totalResult.error || activeResult.error || inactiveResult.error) {
      return { success: false, error: 'Failed to get block statistics' }
    }

    return {
      success: true,
      stats: {
        totalBlocks: totalResult.count || 0,
        activeBlocks: activeResult.count || 0,
        inactiveBlocks: inactiveResult.count || 0,
        oldInactiveBlocks: oldInactiveResult.count || 0
      }
    }
  } catch (error) {
    return { 
      success: false, 
      error: `Stats error: ${error instanceof Error ? error.message : String(error)}`
    }
  }
}