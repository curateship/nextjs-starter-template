import { and, eq, lt } from "drizzle-orm"

import type {
  ClearOutPreview,
  ClearOutResult,
} from "@/lib/video/export-clear-out"
import { now } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import { isLiveShare } from "@/server/video/export-shares"
import { deleteOwnedExports } from "@/server/video/exports"
import { videoExportShares, videoRenderJobs } from "@/server/video/schema"

/**
 * Clearing out old exports: every finished export of one person's that was
 * made before a cutoff, counted first and then deleted file and all.
 *
 * An export with a live share link is counted apart and left alone unless the
 * person ticks the box for it, because deleting it breaks a link somebody else
 * may be about to open. Failed and unfinished exports are never swept up: a
 * failed one takes no space, and one still being made is not old.
 */

/** Finished exports made before the cutoff, each marked shared or not. */
async function findOldExports(
  userId: string,
  before: Date,
  database: CustomShellDb
) {
  const rows = await database
    .select({
      id: videoRenderJobs.id,
      bytes: videoRenderJobs.fileSize,
      shareId: videoExportShares.id,
    })
    .from(videoRenderJobs)
    // At most one unrevoked link per export, so the join never doubles a row.
    .leftJoin(
      videoExportShares,
      and(
        eq(videoExportShares.exportId, videoRenderJobs.id),
        isLiveShare(now())
      )
    )
    .where(
      and(
        eq(videoRenderJobs.userId, userId),
        eq(videoRenderJobs.status, "ready"),
        lt(videoRenderJobs.finishedAt, before)
      )
    )
  return rows.map((row) => ({
    id: row.id,
    bytes: row.bytes ?? 0,
    shared: !!row.shareId,
  }))
}

function sumBytes(rows: { bytes: number }[]) {
  return rows.reduce((total, row) => total + row.bytes, 0)
}

/** What clearing out everything made before `before` would take. */
export async function previewExportClearOut(
  userId: string,
  before: Date,
  database: CustomShellDb = db
): Promise<ClearOutPreview> {
  const rows = await findOldExports(userId, before, database)
  const unshared = rows.filter((row) => !row.shared)
  const shared = rows.filter((row) => row.shared)
  return {
    before: before.toISOString(),
    exports: unshared.length,
    bytes: sumBytes(unshared),
    shared_exports: shared.length,
    shared_bytes: sumBytes(shared),
  }
}

/**
 * Delete what the preview counted. The rows are read again rather than taken
 * from the browser, so a link turned on since the preview still protects its
 * export.
 */
export async function clearOutOldExports({
  userId,
  before,
  includeShared,
  database = db,
}: {
  userId: string
  before: Date
  includeShared: boolean
  database?: CustomShellDb
}): Promise<ClearOutResult> {
  const rows = (await findOldExports(userId, before, database)).filter(
    (row) => includeShared || !row.shared
  )
  if (!rows.length) return { deleted: 0, bytes_freed: 0, failed: 0 }

  const { deleted_ids: deletedIds, failed_ids: failedIds } =
    await deleteOwnedExports(
      userId,
      rows.map((row) => row.id),
      database
    )
  const deleted = new Set(deletedIds)
  return {
    deleted: deleted.size,
    bytes_freed: sumBytes(rows.filter((row) => deleted.has(row.id))),
    failed: failedIds.length,
  }
}
