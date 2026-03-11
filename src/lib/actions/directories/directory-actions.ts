'use server'

import { createClient } from '@supabase/supabase-js'
import { revalidateTag } from 'next/cache'
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



export interface Directory {
  id: string
  site_id: string
  title: string
  slug: string
  is_published: boolean
  display_order: number
  content_blocks: Record<string, any>
  featured_image: string | null
  description: string | null
  meta_description: string | null
  created_at: string
  updated_at: string
}

export interface DirectoryWithDetails extends Directory {
  site_name: string
  subdomain: string
  user_id: string
}


export interface UpdateDirectoryData {
  title?: string
  slug?: string
  is_published?: boolean
  featured_image?: string | null
  description?: string | null
  meta_description?: string | null
}

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '-')
    .substring(0, 100)
}

export async function getSiteDirectoriesAction(siteId: string) {
  try {
    const supabase = await createServerSupabaseClient()
    
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return { data: null, error: 'Authentication required' }
    }

    // Use admin client to verify site ownership
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

    // Get directories for the site using admin client
    const { data: directories, error: directoriesError } = await supabaseAdmin
      .from('directory')
      .select('*')
      .eq('site_id', siteId)
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: false })

    if (directoriesError) {
      return { data: null, error: directoriesError.message }
    }

    return { data: directories as Directory[], error: null }
  } catch (error) {
    console.error('Error fetching directory:', error)
    return { data: null, error: 'Failed to fetch directory' }
  }
}


export async function updateDirectoryAction(directoryId: string, data: UpdateDirectoryData) {
  try {
    // Validate directory ID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(directoryId)) {
      return { data: null, error: 'Invalid directory ID format' }
    }

    const supabase = await createServerSupabaseClient()

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return { data: null, error: 'Authentication required' }
    }

    // Get the directory to verify ownership
    const { data: directory, error: directoryError } = await supabaseAdmin
      .from('directory')
      .select('*, sites!inner(user_id)')
      .eq('id', directoryId)
      .single()

    if (directoryError || !directory) {
      return { data: null, error: 'Directory not found' }
    }

    if (directory.sites.user_id !== user.id) {
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

      if (slug !== directory.slug) {
        const { data: existingDirectory } = await supabaseAdmin
          .from('directory')
          .select('id')
          .eq('site_id', directory.site_id)
          .eq('slug', slug)
          .neq('id', directoryId)
          .single()

        if (existingDirectory) {
          return { data: null, error: 'A directory with this slug already exists' }
        }
      }
    }

    // Build updates with explicit field whitelist
    const allowedFields = ['title', 'slug', 'is_published', 'featured_image', 'description', 'meta_description'] as const
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

    // Update the directory
    const { data: updatedDirectory, error: updateError } = await supabaseAdmin
      .from('directory')
      .update({
        ...finalUpdates,
        updated_at: new Date().toISOString()
      })
      .eq('id', directoryId)
      .select()
      .single()

    if (updateError) {
      return { data: null, error: updateError.message }
    }

    // Revalidate cache
    revalidateTag('directory')
    revalidateTag(`directory-${directoryId}`)
    revalidateTag(`site-${directory.site_id}`)

    return { data: updatedDirectory as Directory, error: null }
  } catch (error) {
    console.error('Error updating directory:', error)
    return { data: null, error: 'Failed to update directory' }
  }
}

export async function deleteDirectoryAction(directoryId: string) {
  try {
    // Validate directory ID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(directoryId)) {
      return { success: false, error: 'Invalid directory ID format' }
    }

    const supabase = await createServerSupabaseClient()

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return { success: false, error: 'Authentication required' }
    }

    // Get the directory to verify ownership
    const { data: directory, error: directoryError } = await supabaseAdmin
      .from('directory')
      .select('*, sites!inner(user_id)')
      .eq('id', directoryId)
      .single()

    if (directoryError || !directory) {
      return { success: false, error: 'Directory not found' }
    }

    if (directory.sites.user_id !== user.id) {
      return { success: false, error: 'Unauthorized' }
    }

    // Delete the directory
    const { error: deleteError } = await supabaseAdmin
      .from('directory')
      .delete()
      .eq('id', directoryId)

    if (deleteError) {
      return { success: false, error: deleteError.message }
    }

    // Revalidate cache
    revalidateTag('directory')
    revalidateTag(`directory-${directoryId}`)
    revalidateTag(`site-${directory.site_id}`)

    return { success: true, error: null }
  } catch (error) {
    console.error('Error deleting directory:', error)
    return { success: false, error: 'Failed to delete directory' }
  }
}

export async function duplicateDirectoryAction(directoryId: string, newTitle: string) {
  try {
    // Validate directory ID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(directoryId)) {
      return { data: null, error: 'Invalid directory ID format' }
    }

    if (!newTitle?.trim()) {
      return { data: null, error: 'New directory title is required' }
    }

    const supabase = await createServerSupabaseClient()

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return { data: null, error: 'Authentication required' }
    }

    // Get the directory to duplicate
    const { data: originalDirectory, error: directoryError } = await supabaseAdmin
      .from('directory')
      .select('*, sites!inner(user_id)')
      .eq('id', directoryId)
      .single()

    if (directoryError || !originalDirectory) {
      return { data: null, error: 'Directory not found' }
    }

    if (originalDirectory.sites.user_id !== user.id) {
      return { data: null, error: 'Unauthorized' }
    }

    // Generate a unique slug for the duplicate
    const baseSlug = generateSlug(newTitle)
    let slug = baseSlug
    let counter = 1

    while (true) {
      const { data: existingDirectory } = await supabaseAdmin
        .from('directory')
        .select('id')
        .eq('site_id', originalDirectory.site_id)
        .eq('slug', slug)
        .single()

      if (!existingDirectory) break
      slug = `${baseSlug}-${counter}`
      counter++
    }

    // Get the highest display_order for this site
    const { data: maxOrderDirectory } = await supabaseAdmin
      .from('directory')
      .select('display_order')
      .eq('site_id', originalDirectory.site_id)
      .order('display_order', { ascending: false })
      .limit(1)
      .single()

    const nextDisplayOrder = maxOrderDirectory ? maxOrderDirectory.display_order + 1 : 0

    // Create the duplicate
    const { data: newDirectory, error: createError } = await supabaseAdmin
      .from('directory')
      .insert({
        site_id: originalDirectory.site_id,
        title: newTitle,
        slug,
        is_published: false, // Always create duplicates as draft
        featured_image: originalDirectory.featured_image,
        description: originalDirectory.description,
        meta_description: originalDirectory.meta_description,
        content_blocks: originalDirectory.content_blocks || {},
        display_order: nextDisplayOrder
      })
      .select()
      .single()

    if (createError) {
      return { data: null, error: createError.message }
    }

    // Revalidate cache
    revalidateTag('directory')
    revalidateTag(`site-${originalDirectory.site_id}`)

    return { data: newDirectory as Directory, error: null }
  } catch (error) {
    console.error('Error duplicating directory:', error)
    return { data: null, error: 'Failed to duplicate directory' }
  }
}

export async function getDirectoryBySlugAction(siteId: string, slug: string) {
  try {
    // Validate site ID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(siteId)) {
      return { data: null, error: 'Invalid site ID format' }
    }

    const supabase = await createServerSupabaseClient()

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return { data: null, error: 'Authentication required' }
    }

    // Get the directory with site details
    const { data: directory, error: directoryError } = await supabaseAdmin
      .from('directory')
      .select('*, sites!inner(user_id, name, subdomain)')
      .eq('site_id', siteId)
      .eq('slug', slug)
      .single()

    if (directoryError || !directory) {
      return { data: null, error: 'Directory not found' }
    }

    if (directory.sites.user_id !== user.id) {
      return { data: null, error: 'Unauthorized' }
    }

    const directoryWithDetails: DirectoryWithDetails = {
      ...directory,
      site_name: directory.sites.name,
      subdomain: directory.sites.subdomain,
      user_id: directory.sites.user_id
    }

    return { data: directoryWithDetails, error: null }
  } catch (error) {
    console.error('Error fetching directory:', error)
    return { data: null, error: 'Failed to fetch directory' }
  }
}

export async function updateDirectoryBlocksAction(directoryId: string, contentBlocks: Record<string, any>) {
  try {
    // Validate directory ID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(directoryId)) {
      return { success: false, error: 'Invalid directory ID format' }
    }

    const supabase = await createServerSupabaseClient()

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return { success: false, error: 'Authentication required' }
    }

    // Get the directory to verify ownership
    const { data: directory, error: directoryError } = await supabaseAdmin
      .from('directory')
      .select('*, sites!inner(user_id)')
      .eq('id', directoryId)
      .single()

    if (directoryError || !directory) {
      return { success: false, error: 'Directory not found' }
    }

    if (directory.sites.user_id !== user.id) {
      return { success: false, error: 'Unauthorized' }
    }

    // Update the directory blocks
    const { error: updateError } = await supabaseAdmin
      .from('directory')
      .update({
        content_blocks: contentBlocks,
        updated_at: new Date().toISOString()
      })
      .eq('id', directoryId)

    if (updateError) {
      return { success: false, error: updateError.message }
    }

    // Revalidate cache
    revalidateTag('directory')
    revalidateTag(`directory-${directoryId}`)
    revalidateTag(`site-${directory.site_id}`)

    return { success: true, error: null }
  } catch (error) {
    console.error('Error updating directory blocks:', error)
    return { success: false, error: 'Failed to update directory blocks' }
  }
}