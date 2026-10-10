import { eq } from "drizzle-orm"

import { db } from "@/server/db"
import {
  CATALOG_MAX_ATTEMPTS,
  removeFiles,
  storeCatalogBytes,
  YOUTUBE_SOURCE_NAME,
} from "@/server/pomodoro/admin-catalog"
import {
  claimNextLinkImport,
  failLinkImport,
  lockedLinkImportRow,
  putBackLinkImport,
  type LinkImportJob,
} from "@/server/pomodoro/link-imports"
import { pomodoroCatalogItems } from "@/server/pomodoro/schema"
import {
  downloadYoutubeClip,
  YoutubeClipRefusedError,
  type YoutubeClip,
} from "@/server/pomodoro/youtube-clip"
import {
  readYoutubeLink,
  YOUTUBE_CLIP_PLACEHOLDER,
  YOUTUBE_CLIP_PREFIX,
} from "@/lib/pomodoro/youtube-links"

/**
 * The `pomodoro-youtube-imports` worker: fetches the 5 seconds behind a row
 * "Make a theme from a YouTube clip" made, up to 4K, then hands the clip to
 * the catalogue worker. That worker keeps the clip at its own size and takes
 * its middle frame as the still. See "Make a theme from a YouTube clip" in
 * `workspace/docs/catalog-admin.md`. One clip per pass.
 */

/**
 * Longer than yt-dlp's three minutes and FFmpeg's three after it, so a live
 * job is never stolen.
 */
const CLAIM_TIMEOUT_MS = 8 * 60 * 1000
const GAVE_UP = "The YouTube clip could not be fetched"

export async function processYoutubeImports() {
  const job = await claimNextLinkImport({
    prefix: YOUTUBE_CLIP_PREFIX,
    timeoutMs: CLAIM_TIMEOUT_MS,
    gaveUp: GAVE_UP,
  })
  if (!job) return
  await processYoutubeImport(job)
}

async function processYoutubeImport(job: LinkImportJob) {
  const link = readYoutubeLink(job.importUrl)
  if (!link.ok) {
    await failLinkImport(job, "That YouTube link could not be read.")
    return
  }

  let stored: string | null = null
  try {
    const clip = await downloadYoutubeClip(link.id, link.startFromLink ?? 0)
    const file = await storeCatalogBytes(clip.bytes, YOUTUBE_SOURCE_NAME)
    stored = file.path
    if (file.kind !== "video") throw new Error("INVALID_FILE_CONTENT")
    await handOverClip(job, file.path, clip)
  } catch (error) {
    if (stored) await removeFiles([stored])
    if (error instanceof YoutubeClipRefusedError) {
      await failLinkImport(job, error.message)
      return
    }
    console.error(
      "youtube clip failed",
      job.id,
      error instanceof Error ? error.message : "unknown error"
    )
    if (job.attempts >= CATALOG_MAX_ATTEMPTS) await failLinkImport(job, GAVE_UP)
    else await putBackLinkImport(job, { refund: false })
  }
}

/**
 * The clip goes to the catalogue worker with its tries counted from nothing.
 * The video's title and channel fill only what the admin has not filled in
 * while it was on its way.
 */
async function handOverClip(job: LinkImportJob, path: string, clip: YoutubeClip) {
  const handed = await db.transaction(async (tx) => {
    const row = await lockedLinkImportRow(tx, job)
    // Deleted, or given a file of the admin's own while this was fetching.
    if (!row) return false
    await tx
      .update(pomodoroCatalogItems)
      .set({
        label:
          row.label === YOUTUBE_CLIP_PLACEHOLDER && clip.title
            ? clip.title.slice(0, 60).trim()
            : row.label,
        artist: row.artist || clip.channel?.slice(0, 120) || null,
        sourcePath: path,
        sourceKind: "video",
        importUrl: null,
        fileStatus: "queued",
        fileError: null,
        attempts: 0,
        claimedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(pomodoroCatalogItems.id, row.id))
    return true
  })
  if (!handed) await removeFiles([path])
}
