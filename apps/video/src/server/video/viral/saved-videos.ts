import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { and, asc, eq, inArray, isNull, lt, or } from "drizzle-orm"

import { now, uuid } from "@/server/auth/security"
import { db } from "@/server/db"
import { getPublicMediaUrl, uploadToR2 } from "@/server/media/storage"
import { customShellMedia } from "@/server/schema"
import {
  discardGeneratedAsset,
  saveGeneratedAsset,
} from "@/server/video/asset-factories/media"
import { runFfmpeg } from "@/server/video/ffmpeg"
import { videoPlaybackUrl } from "@/server/video/media-urls"
import { videoMediaProxies, videoViralVideos } from "@/server/video/schema"
import { isUniqueViolation } from "@/server/video/unique-violation"
import {
  breakDownVideo,
  readStoredBreakdown,
} from "@/server/video/viral/analysis"
import {
  downloadViralVideo,
  parseVideoLink,
} from "@/server/video/viral/download"
import type { ViralBreakdown } from "@/lib/video/viral-breakdown"
import type { SavedVideoStatus } from "@/lib/video/creators"

/**
 * Saving a video and having it broken down.
 *
 * The status is the job. Pressing the button writes a `waiting` row and
 * returns; a background worker claims it, downloads the file, stores it in the
 * library, takes a cover frame, then has Gemini watch it. Closing the browser
 * does nothing to it, and a restart puts an interrupted row back to `waiting`
 * rather than leaving it stuck.
 *
 * Nothing here is ever started from a click, because a download is minutes and
 * a hundred megabytes. The one thing a click does is write the row.
 */

export const SAVED_VIDEO_ERRORS = {
  notFound: "SAVED_VIDEO_NOT_FOUND",
  notFailed: "SAVED_VIDEO_NOT_FAILED",
} as const

/**
 * How long one claim lasts before another tick may take the job over.
 *
 * It has to outlast the slowest honest run, not the typical one. Downloading
 * can take three minutes, Gemini can spend another ninety seconds just reading
 * a large file, and watching it takes longer again. A lease that runs out
 * mid-job is not a harmless retry: the next tick downloads the same video and
 * **pays for the breakdown a second time**, while the first worker's answer is
 * thrown away because its claim no longer matches. The claim is also pushed
 * forward at each step, so a slow job keeps its place rather than racing this
 * number.
 */
const JOB_LEASE_MS = 20 * 60 * 1000

export type SavedVideoDetail = {
  id: string
  status: SavedVideoStatus
  error: string | null
  title: string | null
  channelName: string | null
  durationSeconds: number | null
  views: number | null
  likes: number | null
  comments: number | null
  postedAt: string | null
  sourceUrl: string
  /** Where the downloaded file plays from, once there is one. */
  playbackUrl: string | null
  breakdown: ViralBreakdown | null
}

/**
 * Writes the row the worker will pick up, or hands back the one that is
 * already there. Pressing the button twice, or saving the same video from the
 * Viral page and the dashboard, is one row — the unique index says so and this
 * reads it back rather than refusing.
 */
export async function saveVideoForBreakdown(
  ownerId: string,
  url: string
): Promise<SavedVideoDetail> {
  const link = parseVideoLink(url)
  const at = now()

  try {
    const [created] = await db
      .insert(videoViralVideos)
      .values({
        id: uuid(),
        ownerId,
        platform: link.platform,
        platformVideoId: link.platformVideoId,
        sourceUrl: url,
        status: "waiting",
        createdAt: at,
        updatedAt: at,
      })
      .returning()
    if (created) return await detailFor(created)
  } catch (error) {
    if (!isUniqueViolation(error)) throw error
  }

  const [existing] = await db
    .select()
    .from(videoViralVideos)
    .where(
      and(
        eq(videoViralVideos.ownerId, ownerId),
        eq(videoViralVideos.platform, link.platform),
        eq(videoViralVideos.platformVideoId, link.platformVideoId)
      )
    )
  if (!existing) throw new Error(SAVED_VIDEO_ERRORS.notFound)
  return detailFor(existing)
}

/** Puts a failed row back in the queue. Only a failed one can be retried. */
export async function retrySavedVideo(
  ownerId: string,
  id: string
): Promise<SavedVideoDetail> {
  const [row] = await db
    .update(videoViralVideos)
    .set({
      status: "waiting",
      error: null,
      leaseToken: null,
      leaseExpiresAt: null,
      updatedAt: now(),
    })
    .where(
      and(
        eq(videoViralVideos.id, id),
        eq(videoViralVideos.ownerId, ownerId),
        eq(videoViralVideos.status, "failed")
      )
    )
    .returning()
  if (!row) throw new Error(SAVED_VIDEO_ERRORS.notFailed)
  return detailFor(row)
}

export async function loadSavedVideo(
  ownerId: string,
  id: string
): Promise<SavedVideoDetail> {
  const [row] = await db
    .select()
    .from(videoViralVideos)
    .where(
      and(eq(videoViralVideos.id, id), eq(videoViralVideos.ownerId, ownerId))
    )
  if (!row) throw new Error(SAVED_VIDEO_ERRORS.notFound)
  return detailFor(row)
}

/**
 * Where the stored file plays from. The bucket's own address, exactly as the
 * editor does it: a `<video>` asking an app route for byte ranges is refused
 * outright by the dev server, so a file served that way would never play while
 * developing.
 */
async function detailFor(
  row: typeof videoViralVideos.$inferSelect
): Promise<SavedVideoDetail> {
  let playbackUrl: string | null = null
  if (row.mediaId) {
    const [media] = await db
      .select({
        storagePath: customShellMedia.storagePath,
        proxyStatus: videoMediaProxies.status,
        proxyPath: videoMediaProxies.storagePath,
      })
      .from(customShellMedia)
      .leftJoin(
        videoMediaProxies,
        eq(videoMediaProxies.mediaId, customShellMedia.id)
      )
      .where(eq(customShellMedia.id, row.mediaId))
    if (media) {
      playbackUrl = await videoPlaybackUrl(
        await getPublicMediaUrl(media.storagePath),
        media.proxyStatus
          ? { status: media.proxyStatus, storagePath: media.proxyPath }
          : null
      )
    }
  }

  return {
    id: row.id,
    status: row.status as SavedVideoStatus,
    error: row.error,
    title: row.title,
    channelName: row.channelName,
    durationSeconds: row.durationSeconds,
    views: row.views,
    likes: row.likes,
    comments: row.comments,
    postedAt: row.postedAt?.toISOString() ?? null,
    sourceUrl: row.sourceUrl,
    playbackUrl,
    breakdown: readStoredBreakdown(row.breakdown),
  }
}

// ---------------------------------------------------------------------------
// The worker.

type ClaimedVideo = typeof videoViralVideos.$inferSelect & {
  leaseToken: string
}

/**
 * One step per tick: claim a waiting video and take it all the way through, or
 * put back one whose worker went away mid-job.
 */
export async function viralVideoTick(): Promise<void> {
  await releaseAbandoned()
  const claimed = await claimWaiting()
  if (claimed) await runJob(claimed)
}

/**
 * A row left `downloading` or `analysing` by a restart has a lease nobody is
 * holding any more. Putting it back to `waiting` is what makes closing the
 * browser — or redeploying — harmless.
 */
async function releaseAbandoned(): Promise<void> {
  const at = now()
  await db
    .update(videoViralVideos)
    .set({
      status: "waiting",
      leaseToken: null,
      leaseExpiresAt: null,
      updatedAt: at,
    })
    .where(
      and(
        inArray(videoViralVideos.status, ["downloading", "analysing"]),
        or(
          isNull(videoViralVideos.leaseExpiresAt),
          lt(videoViralVideos.leaseExpiresAt, at)
        )
      )
    )
}

async function claimWaiting(): Promise<ClaimedVideo | null> {
  const [waiting] = await db
    .select()
    .from(videoViralVideos)
    .where(eq(videoViralVideos.status, "waiting"))
    .orderBy(asc(videoViralVideos.createdAt))
    .limit(1)
  if (!waiting) return null

  const leaseToken = uuid()
  const at = now()
  const [claimed] = await db
    .update(videoViralVideos)
    .set({
      status: "downloading",
      leaseToken,
      leaseExpiresAt: new Date(at.getTime() + JOB_LEASE_MS),
      updatedAt: at,
    })
    .where(
      and(
        eq(videoViralVideos.id, waiting.id),
        // Only one tick can win this, so two servers never download the same
        // video twice.
        eq(videoViralVideos.status, "waiting")
      )
    )
    .returning()
  return claimed ? { ...claimed, leaseToken } : null
}

async function runJob(job: ClaimedVideo): Promise<void> {
  try {
    const downloaded = await downloadViralVideo(job.sourceUrl)

    const asset = await saveGeneratedAsset({
      userId: job.ownerId,
      bytes: downloaded.bytes,
      mimeType: downloaded.mimeType,
      fileType: "video",
      name: downloaded.title ?? "Saved video",
    })

    const thumbnailStoragePath = await makeCover(
      job,
      downloaded.bytes,
      downloaded.mimeType
    )

    // Everything the download learned, written before the breakdown starts, so
    // a row that fails being watched still shows its numbers and its player.
    // The claim is pushed forward here too: downloading has already eaten part
    // of it, and the breakdown about to run is the expensive half.
    const movedAt = now()
    const [moved] = await db
      .update(videoViralVideos)
      .set({
        status: "analysing",
        mediaId: asset.id,
        thumbnailStoragePath,
        title: downloaded.title,
        channelName: downloaded.channelName,
        durationSeconds: downloaded.durationSeconds,
        views: downloaded.views,
        likes: downloaded.likes,
        comments: downloaded.comments,
        postedAt: downloaded.postedAt,
        leaseExpiresAt: new Date(movedAt.getTime() + JOB_LEASE_MS),
        updatedAt: movedAt,
      })
      .where(
        and(
          eq(videoViralVideos.id, job.id),
          eq(videoViralVideos.leaseToken, job.leaseToken)
        )
      )
      .returning({ id: videoViralVideos.id })
    // Somebody else took the job over, or it was deleted while downloading.
    // The video file just stored belongs to nothing now, so it goes with it
    // rather than sitting in the bucket with no row pointing at it.
    //
    // The cover is deliberately left alone. Its name is built from the job's
    // id, so both workers write the very same object — deleting it here would
    // take the cover belonging to the worker that won.
    if (!moved) {
      await discardGeneratedAsset(asset)
      return
    }

    // A retry downloads the video again, so the copy from the attempt before
    // is now unreferenced. Removed only after the new one is safely on the row.
    if (job.mediaId && job.mediaId !== asset.id) {
      await discardMediaById(job.mediaId)
    }

    const breakdown = await breakDownVideo({
      userId: job.ownerId,
      bytes: downloaded.bytes,
      mimeType: downloaded.mimeType,
      durationSeconds: downloaded.durationSeconds,
      savedVideoId: job.id,
    })

    await db
      .update(videoViralVideos)
      .set({
        status: "ready",
        breakdown,
        error: null,
        leaseToken: null,
        leaseExpiresAt: null,
        updatedAt: now(),
      })
      .where(
        and(
          eq(videoViralVideos.id, job.id),
          eq(videoViralVideos.leaseToken, job.leaseToken)
        )
      )
  } catch (error) {
    await failJob(job, error)
  }
}

/**
 * A failure keeps its reason on the row and offers Try again. Never a row left
 * half-saved with no status: whatever went wrong, the row ends up `failed`
 * with a sentence somebody can act on.
 */
async function failJob(job: ClaimedVideo, error: unknown): Promise<void> {
  const message =
    error instanceof Error && error.message
      ? error.message
      : "The video could not be saved."
  console.error("A saved video failed", job.id, error)
  await db
    .update(videoViralVideos)
    .set({
      status: "failed",
      error: message.slice(0, 500),
      leaseToken: null,
      leaseExpiresAt: null,
      updatedAt: now(),
    })
    .where(
      and(
        eq(videoViralVideos.id, job.id),
        eq(videoViralVideos.leaseToken, job.leaseToken)
      )
    )
}

/** Removes a stored file the row no longer points at, by its media id. */
async function discardMediaById(mediaId: string): Promise<void> {
  try {
    const [media] = await db
      .select({ storagePath: customShellMedia.storagePath })
      .from(customShellMedia)
      .where(eq(customShellMedia.id, mediaId))
    if (media) {
      await discardGeneratedAsset({ id: mediaId, storagePath: media.storagePath })
    }
  } catch (error) {
    // Tidying up is never worth failing a finished job over.
    console.error("An old saved-video file was not cleared away", mediaId, error)
  }
}

/**
 * A still from one second in, for the feed and the panel. Best effort: a video
 * whose cover cannot be taken is still worth breaking down.
 */
async function makeCover(
  job: ClaimedVideo,
  bytes: Uint8Array,
  mimeType: string
): Promise<string | null> {
  const workDir = await mkdtemp(join(tmpdir(), "viral-cover-"))
  try {
    const inputPath = join(workDir, "input")
    const outputPath = join(workDir, "cover.jpg")
    await writeFile(inputPath, bytes)
    await runFfmpeg(
      [
        "-ss",
        "1",
        "-i",
        inputPath,
        "-frames:v",
        "1",
        "-vf",
        "scale=640:640:force_original_aspect_ratio=decrease:force_divisible_by=2",
        outputPath,
      ],
      "The cover frame could not be made."
    )
    const cover = new Uint8Array(await readFile(outputPath))
    if (!cover.byteLength) return null

    const storagePath = `video-viral-covers/${job.ownerId}/${job.id}.jpg`
    await uploadToR2(storagePath, cover, "image/jpeg")
    return storagePath
  } catch (error) {
    console.error("A saved video's cover frame was not made", job.id, mimeType, error)
    return null
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined)
  }
}
