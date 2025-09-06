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

// Media file metadata interface
export interface MediaData {
  id: string
  filename: string
  original_name: string
  alt_text: string | null
  file_size: number
  file_type: 'image' | 'video'
  storage_path: string
  public_url: string
  created_at: string
  updated_at: string
}

// Media upload data interface
export interface MediaUploadData {
  file: File
  alt_text?: string
}

// Legacy export names for backward compatibility
export type ImageData = MediaData
export type ImageUploadData = MediaUploadData

/**
 * Upload media file (image or video) to Supabase Storage and save metadata
 */
export async function uploadMediaAction(
  file: File,
  alt_text?: string
): Promise<{ data: MediaData | null; error: string | null }> {
  try {
    // Validate file type
    const imageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml']
    const videoTypes = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska']
    const allowedTypes = [...imageTypes, ...videoTypes]
    
    if (!allowedTypes.includes(file.type)) {
      return { data: null, error: 'Invalid file type. Only images (JPEG, PNG, GIF, WebP, SVG) and videos (MP4, WebM, MOV, AVI, MKV) are allowed.' }
    }
    
    const fileType: 'image' | 'video' = imageTypes.includes(file.type) ? 'image' : 'video'

    // Validate file size (10MB for images, 100MB for videos)
    const maxSize = fileType === 'image' ? 10 * 1024 * 1024 : 100 * 1024 * 1024
    const maxSizeLabel = fileType === 'image' ? '10MB' : '100MB'
    if (file.size > maxSize) {
      return { data: null, error: `File size too large. Maximum size is ${maxSizeLabel}.` }
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
    
    // Upload file to Supabase Storage (using site-media bucket for both images and videos)
    const bucketName = 'site-media'
    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from(bucketName)
      .upload(storagePath, fileBuffer, {
        contentType: file.type,
        cacheControl: '31536000', // Cache for 1 year
        upsert: false
      })

    if (uploadError) {
      return { data: null, error: `Upload failed: ${uploadError.message}` }
    }

    // Get public URL
    const { data: urlData } = supabaseAdmin.storage
      .from('site-media')
      .getPublicUrl(storagePath)


    // Save metadata to database
    const { data: mediaData, error: dbError } = await supabaseAdmin
      .from('media')
      .insert({
        user_id: user.id,
        filename: `${timestamp}_${cleanFilename}.${fileExtension}`,
        original_name: file.name,
        alt_text: alt_text || null,
        file_size: file.size,
        file_type: fileType,
        storage_path: storagePath,
        public_url: urlData.publicUrl
      })
      .select('*')
      .single()

    if (dbError) {
      // Clean up uploaded file if database save fails
      await supabaseAdmin.storage
        .from('site-media')
        .remove([storagePath])
      
      return { data: null, error: `Database error: ${dbError.message}` }
    }

    // Return the media data
    const transformedData: MediaData = mediaData

    revalidatePath('/admin/media')
    revalidatePath('/admin/images') // Legacy path
    return { data: transformedData, error: null }

  } catch (error) {
    return { 
      data: null, 
      error: `Server error: ${error instanceof Error ? error.message : String(error)}` 
    }
  }
}

/**
 * Get all media files for the current user
 */
export async function getMediaAction(
  fileType?: 'image' | 'video'
): Promise<{ data: MediaData[] | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return { data: null, error: 'Authentication required' }
    }

    let query = supabaseAdmin
      .from('media')
      .select('*')
      .eq('user_id', user.id)
    
    if (fileType) {
      query = query.eq('file_type', fileType)
    }
    
    const { data: media, error } = await query
      .order('created_at', { ascending: false })

    if (error) {
      return { data: null, error: `Failed to fetch media: ${error.message}` }
    }

    return { data: media as MediaData[], error: null }

  } catch (error) {
    return { 
      data: null, 
      error: `Server error: ${error instanceof Error ? error.message : String(error)}` 
    }
  }
}

/**
 * Update media file metadata
 */
export async function updateMediaAction(
  mediaId: string,
  updates: { alt_text?: string }
): Promise<{ data: MediaData | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return { data: null, error: 'Authentication required' }
    }

    const { data: mediaData, error } = await supabaseAdmin
      .from('media')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', mediaId)
      .eq('user_id', user.id) // Ensure user owns the file
      .select()
      .single()

    if (error) {
      return { data: null, error: `Failed to update media: ${error.message}` }
    }

    // Return the updated media data
    const transformedData: MediaData = mediaData

    revalidatePath('/admin/media')
    revalidatePath('/admin/images') // Legacy path
    return { data: transformedData, error: null }

  } catch (error) {
    return { 
      data: null, 
      error: `Server error: ${error instanceof Error ? error.message : String(error)}` 
    }
  }
}

/**
 * Delete media file and remove from storage
 */
export async function deleteMediaAction(mediaId: string): Promise<{ success: boolean; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return { success: false, error: 'Authentication required' }
    }

    // Get media data first
    const { data: media, error: fetchError } = await supabaseAdmin
      .from('media')
      .select('storage_path')
      .eq('id', mediaId)
      .eq('user_id', user.id)
      .single()

    if (fetchError || !media) {
      return { success: false, error: 'Media file not found or access denied' }
    }

    // Delete from database
    const { error: dbError } = await supabaseAdmin
      .from('media')
      .delete()
      .eq('id', mediaId)
      .eq('user_id', user.id)

    if (dbError) {
      return { success: false, error: `Database error: ${dbError.message}` }
    }

    // Delete from storage
    const { error: storageError } = await supabaseAdmin.storage
      .from('site-media')
      .remove([media.storage_path])

    if (storageError) {
      console.error('Storage deletion failed:', storageError)
      // Don't fail the entire operation if storage deletion fails
    }

    revalidatePath('/admin/media')
    revalidatePath('/admin/images') // Legacy path
    return { success: true, error: null }

  } catch (error) {
    return { 
      success: false, 
      error: `Server error: ${error instanceof Error ? error.message : String(error)}` 
    }
  }
}


/**
 * Get media file ID by public URL
 */
export async function getMediaByUrlAction(publicUrl: string): Promise<{ data: string | null; error: string | null }> {
  try {
    if (!publicUrl) {
      return { data: null, error: 'No URL provided' }
    }

    const supabase = await createSupabaseServerClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return { data: null, error: 'Authentication required' }
    }

    const { data: media, error } = await supabaseAdmin
      .from('media')
      .select('id')
      .eq('public_url', publicUrl)
      .eq('user_id', user.id)
      .single()

    if (error) {
      return { data: null, error: `Media file not found: ${error.message}` }
    }

    return { data: media.id, error: null }

  } catch (error) {
    return { 
      data: null, 
      error: `Server error: ${error instanceof Error ? error.message : String(error)}` 
    }
  }
}

// Legacy function exports for backward compatibility
export const uploadImageAction = uploadMediaAction
export const getImagesAction = async () => getMediaAction('image')
export const updateImageAction = updateMediaAction
export const deleteImageAction = deleteMediaAction
export const getImageByUrlAction = getMediaByUrlAction
