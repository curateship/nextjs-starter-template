import { and, count, desc, eq, ilike, inArray, or, type SQL } from "drizzle-orm"

import {
  EXPORT_DESCRIPTION_MAX,
  EXPORT_TITLE_MAX,
  RENDER_NOT_FOUND_MESSAGE,
} from "@/lib/video/render"
import { now } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import { deleteFromR2, uploadToR2 } from "@/server/media/storage"
import { videoProjects, videoRenderJobs } from "@/server/video/schema"
import {
  serializeRenderJob,
  type RenderJobSummary,
} from "@/server/video/render-queue"
import { extractCoverFrameFromStorage } from "@/server/video/render"

/**
 * The gallery: every export that finished, whatever project it came from.
 *
 * It reads the same rows the queue writes, so there is one story about what was
 * made and when. Only finished ones appear — a waiting or failed export belongs
 * to the editor that asked for it, not to a shelf of results.
 */

export type ExportListResponse = {
  exports: RenderJobSummary[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

export async function listOwnedExports({
  userId,
  page = 1,
  pageSize = 24,
  search = "",
  database = db,
}: {
  userId: string
  page?: number
  pageSize?: number
  search?: string
  database?: CustomShellDb
}): Promise<ExportListResponse> {
  const safePage = Math.max(1, Math.floor(page))
  const safePageSize = Math.min(100, Math.max(1, Math.floor(pageSize)))

  const filters: SQL[] = [
    eq(videoRenderJobs.userId, userId),
    eq(videoRenderJobs.status, "ready"),
  ]
  const cleanedSearch = search.trim()
  if (cleanedSearch) {
    // Wildcards are escaped, so searching for "%" finds a title with a percent
    // sign in it rather than everything.
    const pattern = `%${cleanedSearch.replace(/([\\%_])/g, "\\$1")}%`
    const matches = or(
      ilike(videoRenderJobs.title, pattern),
      ilike(videoRenderJobs.description, pattern),
      ilike(videoProjects.name, pattern)
    )
    if (matches) filters.push(matches)
  }
  const where = and(...filters)

  const [rows, [totals]] = await Promise.all([
    database
      .select({ job: videoRenderJobs, projectName: videoProjects.name })
      .from(videoRenderJobs)
      .innerJoin(videoProjects, eq(videoProjects.id, videoRenderJobs.projectId))
      .where(where)
      .orderBy(desc(videoRenderJobs.finishedAt), desc(videoRenderJobs.id))
      .limit(safePageSize)
      .offset((safePage - 1) * safePageSize),
    database
      .select({ total: count() })
      .from(videoRenderJobs)
      .innerJoin(videoProjects, eq(videoProjects.id, videoRenderJobs.projectId))
      .where(where),
  ])

  const total = totals?.total ?? 0
  return {
    exports: rows.map((row) => serializeRenderJob(row.job, row.projectName)),
    total,
    page: safePage,
    page_size: safePageSize,
    total_pages: Math.max(1, Math.ceil(total / safePageSize)),
  }
}

/** One export of the caller's own, or a refusal. Never anybody else's. */
export async function getOwnedExport(
  userId: string,
  exportId: string,
  database: CustomShellDb = db
) {
  const [row] = await database
    .select()
    .from(videoRenderJobs)
    .where(
      and(eq(videoRenderJobs.id, exportId), eq(videoRenderJobs.userId, userId))
    )
    .limit(1)
  if (!row) throw new Error(RENDER_NOT_FOUND_MESSAGE)
  return row
}

export async function updateOwnedExport({
  userId,
  exportId,
  title,
  description,
  database = db,
}: {
  userId: string
  exportId: string
  title: string
  description: string
  database?: CustomShellDb
}): Promise<RenderJobSummary> {
  await getOwnedExport(userId, exportId, database)
  const [row] = await database
    .update(videoRenderJobs)
    .set({
      title: title.trim().slice(0, EXPORT_TITLE_MAX) || null,
      description: description.trim().slice(0, EXPORT_DESCRIPTION_MAX) || null,
      updatedAt: now(),
    })
    .where(
      and(eq(videoRenderJobs.id, exportId), eq(videoRenderJobs.userId, userId))
    )
    .returning()
  return serializeRenderJob(row)
}

/**
 * Pick a different moment of the video as its cover. The frame is taken from
 * the finished file itself, so the picture always belongs to the export it is
 * standing in for.
 */
export async function setOwnedExportCover({
  userId,
  exportId,
  atMs,
  database = db,
}: {
  userId: string
  exportId: string
  atMs: number
  database?: CustomShellDb
}): Promise<RenderJobSummary> {
  const row = await getOwnedExport(userId, exportId, database)
  if (row.status !== "ready" || !row.storagePath) {
    throw new Error(RENDER_NOT_FOUND_MESSAGE)
  }

  const frame = await extractCoverFrameFromStorage(row.storagePath, atMs)
  if (!frame) throw new Error("That moment could not be turned into a picture")

  // A new name each time, so no cache anywhere can keep handing back the old
  // cover after somebody has changed it.
  const coverPath = `video/export-covers/${userId}/${exportId}-${Date.now()}.jpg`
  await uploadToR2(coverPath, frame, "image/jpeg")
  const previousPath = row.thumbnailStoragePath

  const [updated] = await database
    .update(videoRenderJobs)
    .set({ thumbnailStoragePath: coverPath, updatedAt: now() })
    .where(
      and(eq(videoRenderJobs.id, exportId), eq(videoRenderJobs.userId, userId))
    )
    .returning()

  if (previousPath && previousPath !== coverPath) {
    await deleteFromR2(previousPath).catch(() => undefined)
  }
  return serializeRenderJob(updated)
}

/**
 * Throw exports away, file and all. The stored files go first: a row with no
 * file is a broken card somebody can delete again, while a file with no row is
 * rubbish nobody can ever find.
 */
export async function deleteOwnedExports(
  userId: string,
  exportIds: string[],
  database: CustomShellDb = db
): Promise<{ deleted_ids: string[] }> {
  const uniqueIds = Array.from(new Set(exportIds))
  if (!uniqueIds.length) return { deleted_ids: [] }

  const rows = await database
    .select()
    .from(videoRenderJobs)
    .where(
      and(
        eq(videoRenderJobs.userId, userId),
        inArray(videoRenderJobs.id, uniqueIds)
      )
    )
  if (!rows.length) return { deleted_ids: [] }

  for (const row of rows) {
    if (row.storagePath) {
      await deleteFromR2(row.storagePath).catch(() => undefined)
    }
    if (row.thumbnailStoragePath) {
      await deleteFromR2(row.thumbnailStoragePath).catch(() => undefined)
    }
  }

  const deleted = await database
    .delete(videoRenderJobs)
    .where(
      and(
        eq(videoRenderJobs.userId, userId),
        inArray(
          videoRenderJobs.id,
          rows.map((row) => row.id)
        )
      )
    )
    .returning({ id: videoRenderJobs.id })

  return { deleted_ids: deleted.map((row) => row.id) }
}
