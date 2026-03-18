"use server"

import { revalidatePath } from 'next/cache'
import { eq, and, desc, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { media } from '@/lib/db/schema'
import { getAuthenticatedUser } from '@/lib/db/helpers'
import { uploadToR2, deleteFromR2 } from '@/lib/utils/r2'

export interface MediaData {
  id: string
  filename: string
  original_name: string
  alt_text: string | null
  file_size: number
  file_type: 'image' | 'video'
  storage_path: string
  public_url: string
  site_id: string | null
  created_at: string
  updated_at: string
}

export interface MediaUploadData {
  file: File
  alt_text?: string
}

export type ImageData = MediaData
export type ImageUploadData = MediaUploadData

function toMediaData(row: any): MediaData {
  return {
    id: row.id,
    filename: row.filename,
    original_name: row.originalName ?? row.original_name,
    alt_text: row.altText ?? row.alt_text ?? null,
    file_size: row.fileSize ?? row.file_size,
    file_type: row.fileType ?? row.file_type,
    storage_path: row.storagePath ?? row.storage_path,
    public_url: row.publicUrl ?? row.public_url,
    site_id: row.siteId ?? row.site_id ?? null,
    created_at: row.createdAt ? new Date(row.createdAt).toISOString() : row.created_at,
    updated_at: row.updatedAt ? new Date(row.updatedAt).toISOString() : row.updated_at,
  }
}

export async function uploadMediaAction(
  file: File,
  alt_text?: string,
  site_id?: string
): Promise<{ data: MediaData | null; error: string | null }> {
  try {
    const imageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml']
    const videoTypes = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska']
    const allowedTypes = [...imageTypes, ...videoTypes]

    if (!allowedTypes.includes(file.type)) {
      return { data: null, error: 'Invalid file type. Only images (JPEG, PNG, GIF, WebP, SVG) and videos (MP4, WebM, MOV, AVI, MKV) are allowed.' }
    }

    const fileType: 'image' | 'video' = imageTypes.includes(file.type) ? 'image' : 'video'

    const maxSize = fileType === 'image' ? 10 * 1024 * 1024 : 100 * 1024 * 1024
    const maxSizeLabel = fileType === 'image' ? '10MB' : '100MB'
    if (file.size > maxSize) {
      return { data: null, error: `File size too large. Maximum size is ${maxSizeLabel}.` }
    }

    const user = await getAuthenticatedUser()
    if (!user) return { data: null, error: 'Authentication required' }

    const timestamp = Date.now()
    const fileExtension = file.name.split('.').pop() || ''
    const cleanFilename = file.name
      .replace(/\.[^/.]+$/, '')
      .replace(/[^a-zA-Z0-9.-]/g, '-')

    const arrayBuffer = await file.arrayBuffer()
    const fileBuffer = Buffer.from(arrayBuffer)

    const r2FileName = `${user.id}/${timestamp}_${cleanFilename}.${fileExtension}`
    let publicUrl: string

    try {
      publicUrl = await uploadToR2(r2FileName, fileBuffer, file.type)
    } catch (uploadError) {
      return { data: null, error: `Upload failed: ${uploadError instanceof Error ? uploadError.message : 'Unknown error'}` }
    }

    const [mediaData] = await db
      .insert(media)
      .values({
        userId: user.id,
        siteId: site_id || null,
        filename: `${timestamp}_${cleanFilename}.${fileExtension}`,
        originalName: file.name,
        altText: alt_text || null,
        fileSize: file.size,
        mimeType: file.type,
        fileType,
        storagePath: r2FileName,
        publicUrl,
      })
      .returning()

    if (!mediaData) {
      try { await deleteFromR2(r2FileName) } catch {}
      return { data: null, error: 'Database error: failed to insert media record' }
    }

    revalidatePath('/admin/media')
    revalidatePath('/admin/images')
    return { data: mediaData as unknown as MediaData, error: null }
  } catch (error) {
    return { data: null, error: `Server error: ${error instanceof Error ? error.message : String(error)}` }
  }
}

export interface PaginatedMediaResponse {
  data: MediaData[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export async function getMediaAction(
  fileType?: 'image' | 'video',
  site_id?: string
): Promise<{ data: MediaData[] | null; error: string | null }> {
  try {
    const user = await getAuthenticatedUser()
    if (!user) return { data: null, error: 'Authentication required' }

    const conditions = [eq(media.userId, user.id)]
    if (site_id) conditions.push(eq(media.siteId, site_id))
    if (fileType) conditions.push(eq(media.fileType, fileType))

    const result = await db
      .select()
      .from(media)
      .where(and(...conditions))
      .orderBy(desc(media.createdAt))

    return { data: result.map(toMediaData), error: null }
  } catch (error) {
    return { data: null, error: `Server error: ${error instanceof Error ? error.message : String(error)}` }
  }
}

export async function getPaginatedMediaAction(
  page: number = 1,
  pageSize: number = 20,
  fileType?: 'image' | 'video',
  site_id?: string
): Promise<{ data: PaginatedMediaResponse | null; error: string | null }> {
  try {
    const user = await getAuthenticatedUser()
    if (!user) return { data: null, error: 'Authentication required' }

    const conditions = [eq(media.userId, user.id)]
    if (site_id) conditions.push(eq(media.siteId, site_id))
    if (fileType) conditions.push(eq(media.fileType, fileType))

    const whereClause = and(...conditions)

    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(media)
      .where(whereClause)

    const totalCount = countResult?.count || 0
    const totalPages = Math.ceil(totalCount / pageSize)
    const offset = (page - 1) * pageSize

    const result = await db
      .select()
      .from(media)
      .where(whereClause)
      .orderBy(desc(media.createdAt))
      .limit(pageSize)
      .offset(offset)

    return {
      data: {
        data: result.map(toMediaData),
        total: totalCount,
        page,
        pageSize,
        totalPages,
      },
      error: null,
    }
  } catch (error) {
    return { data: null, error: `Server error: ${error instanceof Error ? error.message : String(error)}` }
  }
}

export async function updateMediaAction(
  mediaId: string,
  updates: { alt_text?: string }
): Promise<{ data: MediaData | null; error: string | null }> {
  try {
    const user = await getAuthenticatedUser()
    if (!user) return { data: null, error: 'Authentication required' }

    const [updated] = await db
      .update(media)
      .set({ altText: updates.alt_text, updatedAt: new Date() })
      .where(and(eq(media.id, mediaId), eq(media.userId, user.id)))
      .returning()

    if (!updated) return { data: null, error: 'Media not found or access denied' }

    revalidatePath('/admin/media')
    revalidatePath('/admin/images')
    return { data: updated as unknown as MediaData, error: null }
  } catch (error) {
    return { data: null, error: `Server error: ${error instanceof Error ? error.message : String(error)}` }
  }
}

export async function deleteMediaAction(mediaId: string): Promise<{ success: boolean; error: string | null }> {
  try {
    const user = await getAuthenticatedUser()
    if (!user) return { success: false, error: 'Authentication required' }

    const existing = await db.query.media.findFirst({
      where: and(eq(media.id, mediaId), eq(media.userId, user.id)),
      columns: { storagePath: true },
    })

    if (!existing) return { success: false, error: 'Media file not found or access denied' }

    await db.delete(media).where(and(eq(media.id, mediaId), eq(media.userId, user.id)))

    try { await deleteFromR2(existing.storagePath) } catch (e) { console.error('R2 deletion failed:', e) }

    revalidatePath('/admin/media')
    revalidatePath('/admin/images')
    return { success: true, error: null }
  } catch (error) {
    return { success: false, error: `Server error: ${error instanceof Error ? error.message : String(error)}` }
  }
}

export async function getMediaByUrlAction(publicUrl: string): Promise<{ data: string | null; error: string | null }> {
  try {
    if (!publicUrl) return { data: null, error: 'No URL provided' }

    const user = await getAuthenticatedUser()
    if (!user) return { data: null, error: 'Authentication required' }

    const result = await db.query.media.findFirst({
      where: and(eq(media.publicUrl, publicUrl), eq(media.userId, user.id)),
      columns: { id: true },
    })

    if (!result) return { data: null, error: 'Media file not found' }
    return { data: result.id, error: null }
  } catch (error) {
    return { data: null, error: `Server error: ${error instanceof Error ? error.message : String(error)}` }
  }
}

export async function getMediaDataByUrlAction(publicUrl: string): Promise<{ data: MediaData | null; error: string | null }> {
  try {
    if (!publicUrl) return { data: null, error: 'No URL provided' }

    const user = await getAuthenticatedUser()
    if (!user) return { data: null, error: 'Authentication required' }

    const result = await db.query.media.findFirst({
      where: and(eq(media.publicUrl, publicUrl), eq(media.userId, user.id)),
    })

    return { data: (result as unknown as MediaData) || null, error: null }
  } catch (error) {
    return { data: null, error: `Server error: ${error instanceof Error ? error.message : String(error)}` }
  }
}

export const uploadImageAction = uploadMediaAction
export const getImagesAction = async () => await getMediaAction('image')
export const updateImageAction = updateMediaAction
export const deleteImageAction = deleteMediaAction
export const getImageByUrlAction = getMediaByUrlAction
