import { and, eq } from 'drizzle-orm'

import { revalidatePath } from '@/lib/cache'
import { db } from '@/lib/db'
import { media, sites } from '@/lib/db/schema'
import { getAuthenticatedUser } from '@/lib/db/helpers'
import { deleteFromR2, uploadToR2 } from '@/lib/utils/r2'
import type { MediaData } from './media-actions'
import { defaultExtensionForMimeType, prepareMediaBuffer } from './media-content-validation'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function toIsoDate(value: unknown): string {
  if (!value) return new Date().toISOString()
  if (value instanceof Date) return value.toISOString()
  return new Date(value as string).toISOString()
}

function toMediaData(row: any): MediaData {
  return {
    id: row.id,
    filename: row.filename,
    original_name: row.originalName ?? row.original_name,
    alt_text: row.altText ?? row.alt_text ?? null,
    file_size: Number(row.fileSize ?? row.file_size ?? 0),
    mime_type: row.mimeType ?? row.mime_type,
    file_type: row.fileType ?? row.file_type,
    storage_path: row.storagePath ?? row.storage_path,
    public_url: row.publicUrl ?? row.public_url,
    site_id: row.siteId ?? row.site_id ?? null,
    created_at: toIsoDate(row.createdAt ?? row.created_at),
    updated_at: toIsoDate(row.updatedAt ?? row.updated_at),
  }
}

async function validateSiteScope(userId: string, siteId?: string | null) {
  if (!siteId) return { siteId: null, error: 'Site ID is required' }
  if (!UUID_REGEX.test(siteId)) return { siteId: null, error: 'Invalid site ID format' }

  const [site] = await db
    .select({ id: sites.id })
    .from(sites)
    .where(and(eq(sites.id, siteId), eq(sites.userId, userId)))

  if (!site) return { siteId: null, error: 'Site not found or unauthorized' }
  return { siteId: site.id, error: null }
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

    const scope = await validateSiteScope(user.id, site_id)
    if (scope.error !== null) return { data: null, error: scope.error }

    const timestamp = Date.now()
    const fileExtension = defaultExtensionForMimeType(file.type)
    const cleanFilename = file.name
      .replace(/\.[^/.]+$/, '')
      .replace(/[^a-zA-Z0-9.-]/g, '-')

    const arrayBuffer = await file.arrayBuffer()
    let fileBuffer: Buffer
    try {
      fileBuffer = prepareMediaBuffer(file.type, Buffer.from(arrayBuffer))
    } catch (error) {
      return { data: null, error: error instanceof Error ? error.message : 'Invalid SVG file.' }
    }

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
        siteId: scope.siteId,
        filename: `${timestamp}_${cleanFilename}.${fileExtension}`,
        originalName: file.name,
        altText: alt_text || null,
        fileSize: fileBuffer.length,
        mimeType: file.type,
        fileType,
        storagePath: r2FileName,
        publicUrl,
      })
      .returning()

    if (!mediaData) {
      try { await deleteFromR2(r2FileName) } catch { /* Best-effort cleanup. */ }
      return { data: null, error: 'Database error: failed to insert media record' }
    }

    revalidatePath('/admin/media')
    revalidatePath('/admin/images')
    return { data: toMediaData(mediaData), error: null }
  } catch (error) {
    return { data: null, error: `Server error: ${error instanceof Error ? error.message : String(error)}` }
  }
}
