import { and, eq, gt, inArray, isNull, or } from "drizzle-orm"

import {
  SHARE_ONLY_READY_MESSAGE,
  SHARE_TOKEN_PATTERN,
  type ExportShareSummary,
  type SharedExportView,
} from "@/lib/video/export-shares"
import { createSecretToken, now, uuid } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import { getOwnedExport } from "@/server/video/exports"
import { videoExportShares, videoRenderJobs } from "@/server/video/schema"
import { isUniqueViolation } from "@/server/video/unique-violation"

/**
 * Share links: one finished export that anybody holding the link can watch
 * without an account.
 *
 * The token is the only lock, so every read of a shared export goes through
 * `findSharedExport`, which checks the link is unrevoked, unexpired and that
 * its export still has a file, on every request. Nothing about a link is
 * cached, which is why turning one off works on the next request.
 */

type ShareRow = typeof videoExportShares.$inferSelect

const DAY_MS = 24 * 60 * 60 * 1000

function serializeShare(row: ShareRow, at: Date): ExportShareSummary {
  return {
    token: row.token,
    created_at: row.createdAt.toISOString(),
    expires_at: row.expiresAt ? row.expiresAt.toISOString() : null,
    expired: !!row.expiresAt && row.expiresAt <= at,
  }
}

/** A link that opens something: not turned off and not past its expiry. */
function isLive(at: Date) {
  return and(
    isNull(videoExportShares.revokedAt),
    or(isNull(videoExportShares.expiresAt), gt(videoExportShares.expiresAt, at))
  )
}

/**
 * The export's current link, or null when it has none. A link past its expiry
 * is still returned, marked expired, so the owner is told when it stopped.
 */
export async function getOwnedExportShare(
  userId: string,
  exportId: string,
  database: CustomShellDb = db
): Promise<ExportShareSummary | null> {
  await getOwnedExport(userId, exportId, database)
  const [row] = await database
    .select()
    .from(videoExportShares)
    .where(
      and(
        eq(videoExportShares.exportId, exportId),
        eq(videoExportShares.userId, userId),
        isNull(videoExportShares.revokedAt)
      )
    )
    .limit(1)
  return row ? serializeShare(row, now()) : null
}

/**
 * A new link for a finished export. Any link it already had, expired or not,
 * is turned off in the same step, so the old address stops working the moment
 * the new one exists.
 */
export async function createOwnedExportShare({
  userId,
  exportId,
  expiresInDays,
  database = db,
}: {
  userId: string
  exportId: string
  expiresInDays: number | null
  database?: CustomShellDb
}): Promise<ExportShareSummary> {
  const job = await getOwnedExport(userId, exportId, database)
  if (job.status !== "ready" || !job.storagePath) {
    throw new Error(SHARE_ONLY_READY_MESSAGE)
  }

  const at = now()
  try {
    const row = await database.transaction(async (tx) => {
      await tx
        .update(videoExportShares)
        .set({ revokedAt: at })
        .where(
          and(
            eq(videoExportShares.exportId, exportId),
            isNull(videoExportShares.revokedAt)
          )
        )
      const [inserted] = await tx
        .insert(videoExportShares)
        .values({
          id: uuid(),
          token: createSecretToken(),
          exportId,
          userId,
          createdAt: at,
          expiresAt: expiresInDays
            ? new Date(at.getTime() + expiresInDays * DAY_MS)
            : null,
        })
        .returning()
      return inserted
    })
    return serializeShare(row, at)
  } catch (error) {
    // Two presses landing together: the other one made the link, so this one
    // hands back that link rather than failing.
    if (!isUniqueViolation(error)) throw error
    const current = await getOwnedExportShare(userId, exportId, database)
    if (!current) throw error
    return current
  }
}

/** Turn the export's link off. The next request for it is refused. */
export async function revokeOwnedExportShare(
  userId: string,
  exportId: string,
  database: CustomShellDb = db
) {
  await getOwnedExport(userId, exportId, database)
  await database
    .update(videoExportShares)
    .set({ revokedAt: now() })
    .where(
      and(
        eq(videoExportShares.exportId, exportId),
        eq(videoExportShares.userId, userId),
        isNull(videoExportShares.revokedAt)
      )
    )
}

/** Which of these exports anybody can open right now, for the Exports list. */
export async function listLiveSharedExportIds(
  userId: string,
  exportIds: string[],
  database: CustomShellDb = db
) {
  if (!exportIds.length) return []
  const rows = await database
    .select({ exportId: videoExportShares.exportId })
    .from(videoExportShares)
    .where(
      and(
        eq(videoExportShares.userId, userId),
        inArray(videoExportShares.exportId, exportIds),
        isLive(now())
      )
    )
  return rows.map((row) => row.exportId)
}

/**
 * The export a link opens, or null for every reason it opens nothing: not a
 * token, never made, turned off, expired, or its export deleted or without a
 * file. The reasons are not told apart, so a stranger learns nothing from
 * trying.
 */
export async function findSharedExport(
  token: string,
  database: CustomShellDb = db
) {
  if (!SHARE_TOKEN_PATTERN.test(token)) return null
  const [row] = await database
    .select({
      storagePath: videoRenderJobs.storagePath,
      status: videoRenderJobs.status,
      title: videoRenderJobs.title,
      width: videoRenderJobs.width,
      height: videoRenderJobs.height,
    })
    .from(videoExportShares)
    .innerJoin(
      videoRenderJobs,
      eq(videoRenderJobs.id, videoExportShares.exportId)
    )
    .where(and(eq(videoExportShares.token, token), isLive(now())))
    .limit(1)
  if (!row || row.status !== "ready" || !row.storagePath) return null
  return { ...row, storagePath: row.storagePath }
}

/** What the public page may show: the export's own title and its shape. */
export async function readSharedExportView(
  token: string,
  database: CustomShellDb = db
): Promise<SharedExportView | null> {
  const row = await findSharedExport(token, database)
  if (!row) return null
  return { title: row.title, width: row.width, height: row.height }
}
