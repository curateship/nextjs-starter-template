"use server"

import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Create authenticated Supabase client for server actions
async function createSupabaseServerClient() {
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

// Image metadata interface
export interface ImageData {
  id: string
  filename: string
  original_name: string
  alt_text: string | null
  file_size: number
  mime_type: string
  width: number | null
  height: number | null
  storage_path: string
  public_url: string
  usage_count: number
  sites_using: number
  created_at: string
  updated_at: string
}

// Image upload data interface
export interface ImageUploadData {
  file: File
  alt_text?: string
}

/**
 * Upload image to Supabase Storage and save metadata
 */
export async function uploadImageAction(
  file: File,
  alt_text?: string
): Promise<{ data: ImageData | null; error: string | null }> {
  try {
    // Validate file type (SVG removed due to XSS risks)
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      return { data: null, error: 'Invalid file type. Only JPEG, PNG, GIF, and WebP images are allowed.' }
    }

    // Validate file size (10MB limit)
    const maxSize = 10 * 1024 * 1024 // 10MB
    if (file.size > maxSize) {
      return { data: null, error: 'File size too large. Maximum size is 10MB.' }
    }

    // Get current user using authenticated client
    const supabase = await createSupabaseServerClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return { data: null, error: 'Authentication required' }
    }

    // Generate storage path
    const timestamp = Date.now()
    const fileExtension = file.name.split('.').pop() || ''
    const cleanFilename = file.name
      .replace(/\.[^/.]+$/, '') // Remove extension
      .replace(/[^a-zA-Z0-9.-]/g, '-') // Replace special chars
    
    const storagePath = `${user.id}/${timestamp}_${cleanFilename}.${fileExtension}`

    // Convert File to ArrayBuffer for upload
    const fileBuffer = await file.arrayBuffer()
    
    // Upload file to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from('site-images')
      .upload(storagePath, fileBuffer, {
        contentType: file.type,
        cacheControl: '31536000' // Cache for 1 year
      })

    if (uploadError) {
      return { data: null, error: `Upload failed: ${uploadError.message}` }
    }

    // Get public URL
    const { data: urlData } = supabaseAdmin.storage
      .from('site-images')
      .getPublicUrl(storagePath)

    // Get image dimensions (for supported formats)
    let width: number | null = null
    let height: number | null = null
    
    if (['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'].includes(file.type)) {
      try {
        // Create image element to get dimensions
        const imageDataUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader()
          reader.onload = (e) => resolve(e.target?.result as string)
          reader.readAsDataURL(file)
        })
        
        // This would work in browser context, but for server we'll skip dimensions for now
        // In production, you might use a library like 'sharp' to get dimensions
      } catch (e) {
        // Ignore dimension errors
      }
    }

    // Save metadata to database
    const { data: imageData, error: dbError } = await supabaseAdmin
      .from('images')
      .insert({
        user_id: user.id,
        filename: `${timestamp}_${cleanFilename}.${fileExtension}`,
        original_name: file.name,
        alt_text: alt_text || null,
        file_size: file.size,
        mime_type: file.type,
        width,
        height,
        storage_path: storagePath,
        public_url: urlData.publicUrl
      })
      .select(`
        *,
        usage_count:image_usage(count),
        sites_using:image_usage(site_id)
      `)
      .single()

    if (dbError) {
      // Clean up uploaded file if database save fails
      await supabaseAdmin.storage
        .from('site-images')
        .remove([storagePath])
      
      return { data: null, error: `Database error: ${dbError.message}` }
    }

    // Transform the data to match ImageData interface
    const transformedData: ImageData = {
      ...imageData,
      usage_count: 0,
      sites_using: 0
    }

    revalidatePath('/admin/images')
    return { data: transformedData, error: null }

  } catch (error) {
    return { 
      data: null, 
      error: `Server error: ${error instanceof Error ? error.message : String(error)}` 
    }
  }
}

/**
 * Get all images for the current user with usage statistics
 */
export async function getImagesAction(): Promise<{ data: ImageData[] | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return { data: null, error: 'Authentication required' }
    }

    const { data: images, error } = await supabaseAdmin
      .from('image_details')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) {
      return { data: null, error: `Failed to fetch images: ${error.message}` }
    }

    return { data: images as ImageData[], error: null }

  } catch (error) {
    return { 
      data: null, 
      error: `Server error: ${error instanceof Error ? error.message : String(error)}` 
    }
  }
}

/**
 * Update image metadata
 */
export async function updateImageAction(
  imageId: string,
  updates: { alt_text?: string }
): Promise<{ data: ImageData | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return { data: null, error: 'Authentication required' }
    }

    const { data: imageData, error } = await supabaseAdmin
      .from('images')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', imageId)
      .eq('user_id', user.id) // Ensure user owns the image
      .select()
      .single()

    if (error) {
      return { data: null, error: `Failed to update image: ${error.message}` }
    }

    // Get usage statistics
    const { data: usageData } = await supabaseAdmin
      .from('image_usage')
      .select('site_id')
      .eq('image_id', imageId)

    const transformedData: ImageData = {
      ...imageData,
      usage_count: usageData?.length || 0,
      sites_using: new Set(usageData?.map(u => u.site_id)).size || 0
    }

    revalidatePath('/admin/images')
    return { data: transformedData, error: null }

  } catch (error) {
    return { 
      data: null, 
      error: `Server error: ${error instanceof Error ? error.message : String(error)}` 
    }
  }
}

/**
 * Delete image and remove from storage
 */
export async function deleteImageAction(imageId: string): Promise<{ success: boolean; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return { success: false, error: 'Authentication required' }
    }

    // Get image data first
    const { data: image, error: fetchError } = await supabaseAdmin
      .from('images')
      .select('storage_path, usage_count:image_usage(count)')
      .eq('id', imageId)
      .eq('user_id', user.id)
      .single()

    if (fetchError || !image) {
      return { success: false, error: 'Image not found or access denied' }
    }

    // Check if image is being used
    const { count: usageCount } = await supabaseAdmin
      .from('image_usage')
      .select('*', { count: 'exact', head: true })
      .eq('image_id', imageId)

    if (usageCount && usageCount > 0) {
      return { success: false, error: 'Cannot delete image that is currently being used in sites' }
    }

    // Delete from database first (this will cascade delete usage records)
    const { error: dbError } = await supabaseAdmin
      .from('images')
      .delete()
      .eq('id', imageId)
      .eq('user_id', user.id)

    if (dbError) {
      return { success: false, error: `Database error: ${dbError.message}` }
    }

    // Delete from storage
    const { error: storageError } = await supabaseAdmin.storage
      .from('site-images')
      .remove([image.storage_path])

    if (storageError) {
      console.error('Storage deletion failed:', storageError)
      // Don't fail the entire operation if storage deletion fails
    }

    revalidatePath('/admin/images')
    return { success: true, error: null }

  } catch (error) {
    return { 
      success: false, 
      error: `Server error: ${error instanceof Error ? error.message : String(error)}` 
    }
  }
}

/**
 * Track image usage in a site block
 */
export async function trackImageUsageAction(
  imageId: string,
  siteId: string,
  blockType: string,
  usageContext: string
): Promise<{ success: boolean; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return { success: false, error: 'Authentication required' }
    }

    // Insert or update usage record
    const { error } = await supabaseAdmin
      .from('image_usage')
      .upsert({
        image_id: imageId,
        site_id: siteId,
        block_type: blockType,
        usage_context: usageContext
      })

    if (error) {
      return { success: false, error: `Failed to track usage: ${error.message}` }
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
 * Get image ID by public URL
 */
export async function getImageByUrlAction(publicUrl: string): Promise<{ data: string | null; error: string | null }> {
  try {
    if (!publicUrl) {
      return { data: null, error: 'No URL provided' }
    }

    const supabase = await createSupabaseServerClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return { data: null, error: 'Authentication required' }
    }

    const { data: image, error } = await supabaseAdmin
      .from('images')
      .select('id')
      .eq('public_url', publicUrl)
      .eq('user_id', user.id)
      .single()

    if (error) {
      return { data: null, error: `Image not found: ${error.message}` }
    }

    return { data: image.id, error: null }

  } catch (error) {
    return { 
      data: null, 
      error: `Server error: ${error instanceof Error ? error.message : String(error)}` 
    }
  }
}

/**
 * Remove image usage tracking
 */
export async function removeImageUsageAction(
  imageId: string,
  siteId: string,
  blockType: string,
  usageContext: string
): Promise<{ success: boolean; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return { success: false, error: 'Authentication required' }
    }

    const { error } = await supabaseAdmin
      .from('image_usage')
      .delete()
      .eq('image_id', imageId)
      .eq('site_id', siteId)
      .eq('block_type', blockType)
      .eq('usage_context', usageContext)

    if (error) {
      return { success: false, error: `Failed to remove usage: ${error.message}` }
    }

    return { success: true, error: null }

  } catch (error) {
    return { 
      success: false, 
      error: `Server error: ${error instanceof Error ? error.message : String(error)}` 
    }
  }
}