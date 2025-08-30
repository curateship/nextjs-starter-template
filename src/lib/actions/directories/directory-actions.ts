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

// Helper functions to work with is_private in content_blocks
function getIsPrivateFromContentBlocks(content_blocks: Record<string, any>): boolean {
  return content_blocks?._settings?.is_private === true
}

function setIsPrivateInContentBlocks(content_blocks: Record<string, any>, is_private: boolean): Record<string, any> {
  return {
    ...content_blocks,
    _settings: {
      ...content_blocks._settings,
      is_private
    }
  }
}

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

export interface CreateDirectoryData {
  title: string
  slug?: string
  is_published?: boolean
  featured_image?: string | null
  description?: string | null
  meta_description?: string | null
  content_blocks?: Record<string, any>
}

export interface UpdateDirectoryData {
  title?: string
  slug?: string
  is_published?: boolean
  featured_image?: string | null
  description?: string | null
  meta_description?: string | null
  content_blocks?: Record<string, any>
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

export async function createDirectoryAction(siteId: string, data: CreateDirectoryData) {
  try {
    const supabase = await createServerSupabaseClient()
    
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return { data: null, error: 'Authentication required' }
    }

    // Verify user owns the site using admin client
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

    // Check if slug is already taken for this site
    const { data: existingDirectory } = await supabaseAdmin
      .from('directory')
      .select('id')
      .eq('site_id', siteId)
      .eq('slug', slug)
      .single()

    if (existingDirectory) {
      return { data: null, error: 'A directory with this slug already exists' }
    }

    // Get the highest display_order for this site
    const { data: maxOrderDirectory } = await supabaseAdmin
      .from('directory')
      .select('display_order')
      .eq('site_id', siteId)
      .order('display_order', { ascending: false })
      .limit(1)
      .single()

    const nextDisplayOrder = maxOrderDirectory ? maxOrderDirectory.display_order + 1 : 0

    // Create the directory using admin client
    const { data: newDirectory, error: createError } = await supabaseAdmin
      .from('directory')
      .insert({
        site_id: siteId,
        title: data.title,
        slug,
        is_published: data.is_published ?? false,
        featured_image: data.featured_image || null,
        description: data.description || null,
        meta_description: data.meta_description || null,
        content_blocks: data.content_blocks || {},
        display_order: nextDisplayOrder
      })
      .select()
      .single()

    if (createError) {
      return { data: null, error: createError.message }
    }

    // Revalidate cache
    revalidateTag('directory')
    revalidateTag(`site-${siteId}`)

    return { data: newDirectory as Directory, error: null }
  } catch (error) {
    console.error('Error creating directory:', error)
    return { data: null, error: 'Failed to create directory' }
  }
}

export async function updateDirectoryAction(directoryId: string, data: UpdateDirectoryData) {
  try {
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

    // If slug is being updated, check if it's already taken
    if (data.slug && data.slug !== directory.slug) {
      const { data: existingDirectory } = await supabaseAdmin
        .from('directory')
        .select('id')
        .eq('site_id', directory.site_id)
        .eq('slug', data.slug)
        .neq('id', directoryId)
        .single()

      if (existingDirectory) {
        return { data: null, error: 'A directory with this slug already exists' }
      }
    }

    // Update the directory
    const { data: updatedDirectory, error: updateError } = await supabaseAdmin
      .from('directory')
      .update({
        ...data,
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