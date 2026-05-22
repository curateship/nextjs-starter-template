"use server"

import { revalidatePath } from 'next/cache'
import { eq, and, desc, inArray, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { media, sites } from '@/lib/db/schema'
import { getAuthenticatedUser } from '@/lib/db/helpers'
import { uploadToR2, deleteFromR2 } from '@/lib/utils/r2'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

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

export interface UnusedMediaScanResponse {
  data: MediaData[]
  total: number
  scanned_at: string
}

export type ImageData = MediaData
export type ImageUploadData = MediaUploadData

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
    file_type: row.fileType ?? row.file_type,
    storage_path: row.storagePath ?? row.storage_path,
    public_url: row.publicUrl ?? row.public_url,
    site_id: row.siteId ?? row.site_id ?? null,
    created_at: toIsoDate(row.createdAt ?? row.created_at),
    updated_at: toIsoDate(row.updatedAt ?? row.updated_at),
  }
}

type SiteScopeResult = { siteId: string; error: null } | { siteId: null; error: string }

async function validateSiteScope(userId: string, site_id?: string | null): Promise<SiteScopeResult> {
  if (!site_id) return { siteId: null, error: 'Site ID is required' }
  if (!UUID_REGEX.test(site_id)) return { siteId: null, error: 'Invalid site ID format' }

  const [site] = await db
    .select({ id: sites.id })
    .from(sites)
    .where(and(eq(sites.id, site_id), eq(sites.userId, userId)))

  if (!site) return { siteId: null, error: 'Site not found or unauthorized' }
  return { siteId: site.id, error: null }
}

export async function uploadMediaAction(
  file: File,
  alt_text?: string,
  site_id?: string
): Promise<{ data: MediaData | null; error: string | null }> {
  try {
    const imageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']
    const videoTypes = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska']
    const allowedTypes = [...imageTypes, ...videoTypes]

    if (!allowedTypes.includes(file.type)) {
      return { data: null, error: 'Invalid file type. Only images (JPEG, PNG, GIF, WebP) and videos (MP4, WebM, MOV, AVI, MKV) are allowed.' }
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
        siteId: scope.siteId,
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
    return { data: toMediaData(mediaData), error: null }
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

    const scope = await validateSiteScope(user.id, site_id)
    if (scope.error !== null) return { data: null, error: scope.error }

    const conditions = [eq(media.userId, user.id), eq(media.siteId, scope.siteId)]
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

    const scope = await validateSiteScope(user.id, site_id)
    if (scope.error !== null) return { data: null, error: scope.error }

    const conditions = [eq(media.userId, user.id), eq(media.siteId, scope.siteId)]
    if (fileType) conditions.push(eq(media.fileType, fileType))

    const whereClause = and(...conditions)

    const offset = (page - 1) * pageSize

    const [countResult, result] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(media).where(whereClause),
      db.select().from(media).where(whereClause).orderBy(desc(media.createdAt)).limit(pageSize).offset(offset),
    ])

    const totalCount = countResult[0]?.count || 0
    const totalPages = Math.ceil(totalCount / pageSize)

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

export async function scanUnusedMediaAction(
  site_id?: string
): Promise<{ data: UnusedMediaScanResponse | null; error: string | null }> {
  try {
    const user = await getAuthenticatedUser()
    if (!user) return { data: null, error: 'Authentication required' }

    const scope = await validateSiteScope(user.id, site_id)
    if (scope.error !== null) return { data: null, error: scope.error }

    const result = await db.execute<{
      id: string
      filename: string
      original_name: string
      alt_text: string | null
      file_size: number | string
      file_type: 'image' | 'video'
      storage_path: string
      public_url: string
      site_id: string | null
      created_at: Date | string
      updated_at: Date | string
    }>(sql`
      select
        m.id,
        m.filename,
        m.original_name,
        m.alt_text,
        m.file_size,
        m.file_type,
        m.storage_path,
        m.public_url,
        m.site_id,
        m.created_at,
        m.updated_at
      from media m
      where m.user_id = ${user.id}
        and m.site_id = ${scope.siteId}::uuid
        and not (
          exists (
            select 1 from users u
            where u.id = ${user.id}
              and u.image = m.public_url
          )
          or exists (
            select 1 from sites s
            where s.id = ${scope.siteId}::uuid
              and position(m.public_url in coalesce(s.settings::text, '')) > 0
          )
          or exists (
            select 1 from site_dashboard_config c
            where c.site_id = ${scope.siteId}::uuid
              and position(m.public_url in coalesce(c.settings::text, '')) > 0
          )
          or exists (
            select 1 from pages p
            where p.site_id = ${scope.siteId}::uuid
              and position(m.public_url in coalesce(p.content_blocks::text, '')) > 0
          )
          or exists (
            select 1 from site_dashboard_pages p
            where p.site_id = ${scope.siteId}::uuid
              and position(m.public_url in coalesce(p.content_blocks::text, '')) > 0
          )
          or exists (
            select 1 from products p
            where p.site_id = ${scope.siteId}::uuid
              and (
                p.featured_image = m.public_url
                or position(m.public_url in coalesce(p.content_blocks::text, '')) > 0
              )
          )
          or exists (
            select 1 from posts p
            where p.site_id = ${scope.siteId}::uuid
              and (
                p.featured_image = m.public_url
                or position(m.public_url in coalesce(p.content, '')) > 0
                or position(m.public_url in coalesce(p.content_blocks::text, '')) > 0
              )
          )
          or exists (
            select 1 from categories c
            where c.site_id = ${scope.siteId}::uuid
              and (
                c.featured_image = m.public_url
                or position(m.public_url in coalesce(c.content_blocks::text, '')) > 0
              )
          )
          or exists (
            select 1 from directory d
            where d.site_id = ${scope.siteId}::uuid
              and (
                d.featured_image = m.public_url
                or position(m.public_url in coalesce(d.content_blocks::text, '')) > 0
              )
          )
          or exists (
            select 1 from events e
            where e.site_id = ${scope.siteId}::uuid
              and (
                e.featured_image = m.public_url
                or position(m.public_url in coalesce(e.content_blocks::text, '')) > 0
              )
          )
          or exists (
            select 1 from sponsors s
            where s.site_id = m.site_id
              and s.image_url = m.public_url
          )
          or exists (
            select 1 from directory_templates t
            where t.site_id = ${scope.siteId}::uuid
              and position(m.public_url in coalesce(t.content_blocks::text, '')) > 0
          )
          or exists (
            select 1 from post_templates t
            where t.site_id = ${scope.siteId}::uuid
              and position(m.public_url in coalesce(t.content_blocks::text, '')) > 0
          )
          or exists (
            select 1 from product_templates t
            where t.site_id = ${scope.siteId}::uuid
              and position(m.public_url in coalesce(t.content_blocks::text, '')) > 0
          )
          or exists (
            select 1 from newsletter_templates t
            where t.site_id = ${scope.siteId}::uuid
              and position(m.public_url in coalesce(t.content_blocks::text, '')) > 0
          )
          or exists (
            select 1 from newsletters n
            where n.site_id = ${scope.siteId}::uuid
              and (
                position(m.public_url in coalesce(n.content, '')) > 0
                or position(m.public_url in coalesce(n.content_blocks::text, '')) > 0
              )
          )
          or exists (
            select 1
            from email_automation_steps step
            join email_automations automation on automation.id = step.automation_id
            where automation.site_id = ${scope.siteId}::uuid
              and (
                position(m.public_url in coalesce(step.content, '')) > 0
                or position(m.public_url in coalesce(step.content_blocks::text, '')) > 0
                or position(m.public_url in coalesce(step.node_config::text, '')) > 0
              )
          )
          or exists (
            select 1 from email_automations automation
            where automation.site_id = ${scope.siteId}::uuid
              and (
                position(m.public_url in coalesce(automation.trigger_config::text, '')) > 0
                or position(m.public_url in coalesce(automation.goal_config::text, '')) > 0
              )
          )
        )
      order by m.created_at desc
    `)

    const unusedMedia = (result.rows || []).map(toMediaData)

    return {
      data: {
        data: unusedMedia,
        total: unusedMedia.length,
        scanned_at: new Date().toISOString(),
      },
      error: null,
    }
  } catch (error) {
    return { data: null, error: `Server error: ${error instanceof Error ? error.message : String(error)}` }
  }
}

export async function updateMediaAction(
  mediaId: string,
  updates: { alt_text?: string },
  site_id?: string
): Promise<{ data: MediaData | null; error: string | null }> {
  try {
    const user = await getAuthenticatedUser()
    if (!user) return { data: null, error: 'Authentication required' }

    const scope = await validateSiteScope(user.id, site_id)
    if (scope.error !== null) return { data: null, error: scope.error }

    const [updated] = await db
      .update(media)
      .set({ altText: updates.alt_text, updatedAt: new Date() })
      .where(and(eq(media.id, mediaId), eq(media.userId, user.id), eq(media.siteId, scope.siteId)))
      .returning()

    if (!updated) return { data: null, error: 'Media not found or access denied' }

    revalidatePath('/admin/media')
    revalidatePath('/admin/images')
    return { data: toMediaData(updated), error: null }
  } catch (error) {
    return { data: null, error: `Server error: ${error instanceof Error ? error.message : String(error)}` }
  }
}

export async function deleteMediaAction(mediaId: string, site_id?: string): Promise<{ success: boolean; error: string | null }> {
  try {
    const user = await getAuthenticatedUser()
    if (!user) return { success: false, error: 'Authentication required' }

    const scope = await validateSiteScope(user.id, site_id)
    if (scope.error !== null) return { success: false, error: scope.error }

    const existing = await db.query.media.findFirst({
      where: and(eq(media.id, mediaId), eq(media.userId, user.id), eq(media.siteId, scope.siteId)),
      columns: { storagePath: true },
    })

    if (!existing) return { success: false, error: 'Media file not found or access denied' }

    await db.delete(media).where(and(eq(media.id, mediaId), eq(media.userId, user.id), eq(media.siteId, scope.siteId)))

    const remaining = await db.query.media.findFirst({
      where: eq(media.storagePath, existing.storagePath),
      columns: { id: true },
    })

    if (!remaining) {
      try { await deleteFromR2(existing.storagePath) } catch (e) { console.error('R2 deletion failed:', e) }
    }

    revalidatePath('/admin/media')
    revalidatePath('/admin/images')
    return { success: true, error: null }
  } catch (error) {
    return { success: false, error: `Server error: ${error instanceof Error ? error.message : String(error)}` }
  }
}

export async function deleteMediaItemsAction(
  mediaIds: string[],
  site_id?: string
): Promise<{ success: boolean; deletedCount: number; error: string | null }> {
  try {
    const user = await getAuthenticatedUser()
    if (!user) return { success: false, deletedCount: 0, error: 'Authentication required' }

    const scope = await validateSiteScope(user.id, site_id)
    if (scope.error !== null) return { success: false, deletedCount: 0, error: scope.error }

    const uniqueIds = [...new Set(mediaIds)].filter((id) => UUID_REGEX.test(id))
    if (uniqueIds.length === 0) return { success: false, deletedCount: 0, error: 'No valid media IDs provided' }

    const rows = await db
      .select({ id: media.id, storagePath: media.storagePath })
      .from(media)
      .where(and(
        inArray(media.id, uniqueIds),
        eq(media.userId, user.id),
        eq(media.siteId, scope.siteId)
      ))

    if (rows.length === 0) return { success: false, deletedCount: 0, error: 'Media files not found or access denied' }

    await db
      .delete(media)
      .where(and(
        inArray(media.id, rows.map((row) => row.id)),
        eq(media.userId, user.id),
        eq(media.siteId, scope.siteId)
      ))

    const storagePaths = [...new Set(rows.map((row) => row.storagePath))]
    for (const storagePath of storagePaths) {
      const remaining = await db.query.media.findFirst({
        where: eq(media.storagePath, storagePath),
        columns: { id: true },
      })

      if (!remaining) {
        try { await deleteFromR2(storagePath) } catch (e) { console.error('R2 deletion failed:', e) }
      }
    }

    revalidatePath('/admin/media')
    revalidatePath('/admin/media/unused')
    revalidatePath('/admin/images')
    return { success: true, deletedCount: rows.length, error: null }
  } catch (error) {
    return {
      success: false,
      deletedCount: 0,
      error: `Server error: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

export async function getMediaByUrlAction(publicUrl: string, site_id?: string): Promise<{ data: string | null; error: string | null }> {
  try {
    if (!publicUrl) return { data: null, error: 'No URL provided' }

    const user = await getAuthenticatedUser()
    if (!user) return { data: null, error: 'Authentication required' }

    const scope = await validateSiteScope(user.id, site_id)
    if (scope.error !== null) return { data: null, error: scope.error }

    const result = await db.query.media.findFirst({
      where: and(eq(media.publicUrl, publicUrl), eq(media.userId, user.id), eq(media.siteId, scope.siteId)),
      columns: { id: true },
    })

    if (!result) return { data: null, error: 'Media file not found' }
    return { data: result.id, error: null }
  } catch (error) {
    return { data: null, error: `Server error: ${error instanceof Error ? error.message : String(error)}` }
  }
}

export async function getMediaDataByUrlAction(publicUrl: string, site_id?: string): Promise<{ data: MediaData | null; error: string | null }> {
  try {
    if (!publicUrl) return { data: null, error: 'No URL provided' }

    const user = await getAuthenticatedUser()
    if (!user) return { data: null, error: 'Authentication required' }

    const scope = await validateSiteScope(user.id, site_id)
    if (scope.error !== null) return { data: null, error: scope.error }

    const result = await db.query.media.findFirst({
      where: and(eq(media.publicUrl, publicUrl), eq(media.userId, user.id), eq(media.siteId, scope.siteId)),
    })

    return { data: result ? toMediaData(result) : null, error: null }
  } catch (error) {
    return { data: null, error: `Server error: ${error instanceof Error ? error.message : String(error)}` }
  }
}

export const uploadImageAction = uploadMediaAction
export const getImagesAction = async () => await getMediaAction('image')
export const updateImageAction = updateMediaAction
export const deleteImageAction = deleteMediaAction
export const getImageByUrlAction = getMediaByUrlAction
