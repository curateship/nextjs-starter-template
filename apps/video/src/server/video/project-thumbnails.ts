import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { and, eq, gt, isNull, or, sql } from "drizzle-orm"

import {
  parseTimelineForReset,
  type ProjectTimeline,
} from "@/lib/video/timeline-schema"
import { now, uuid } from "@/server/auth/security"
import { db } from "@/server/db"
import { deleteFromR2, uploadToR2 } from "@/server/media/storage"
import { customShellMedia } from "@/server/schema"
import { FFMPEG_MISSING_MESSAGE, runFfmpeg } from "@/server/video/ffmpeg"
import {
  videoMediaProxies,
  videoProjects,
  videoProjectThumbnails,
} from "@/server/video/schema"
import { downloadToFile } from "@/server/video/storage-files"

/**
 * The picture beside each project on the projects list (see
 * `workspace/docs/project-thumbnails.md`). It rides the media worker's tick:
 * saving never makes one, because a save lands every few seconds while
 * somebody edits and a picture costs an ffmpeg pass.
 *
 * Each tick looks again at the projects saved since it last looked, works out
 * their first video or picture clip, and queues a new picture only when that
 * clip or its starting moment changed. Then it makes the queued pictures one
 * at a time.
 */

const MAX_ATTEMPTS = 3
const LEASE_SECONDS = 120
const HEARTBEAT_MS = 30_000
const DISCOVER_BATCH = 50
const FRAME_TIMEOUT_MS = 2 * 60_000
const FRAME_FAILED_MESSAGE = "The project's picture could not be made"
const SOURCE_GONE_MESSAGE = "The first clip's file is no longer in the library"

type WorkerState = { draining: boolean }

declare global {
  var __videoProjectThumbnailState: WorkerState | undefined
}

/** On `globalThis` for the same reason as the media worker's own state. */
function workerState(): WorkerState {
  globalThis.__videoProjectThumbnailState ??= { draining: false }
  return globalThis.__videoProjectThumbnailState
}

type PictureSource = { mediaId: string; atMs: number }

/**
 * The clip the picture is taken from: the video or picture clip that starts
 * first, and on a tie the one on the higher lane, which is drawn on top. A
 * video is taken at the moment of the file it starts playing from; a picture
 * has only one moment. Sound and words have no frame to take, so a timeline
 * of only those has no source at all.
 */
export function firstPictureSource(
  timeline: ProjectTimeline
): PictureSource | null {
  let first: { startMs: number; source: PictureSource } | null = null
  for (const track of timeline.tracks) {
    for (const clip of track.clips) {
      if (clip.kind !== "video" && clip.kind !== "image") continue
      if (!clip.mediaId || clip.durationMs <= 0) continue
      // Lanes are read top first, so only a strictly earlier start wins.
      if (first && clip.startMs >= first.startMs) continue
      first = {
        startMs: clip.startMs,
        source: {
          mediaId: clip.mediaId,
          atMs: clip.kind === "video" ? Math.round(clip.trimStartMs) : 0,
        },
      }
    }
  }
  return first?.source ?? null
}

/** One step of the media worker's tick. Each part fails alone. */
export async function projectThumbnailTick() {
  await discoverChangedProjects().catch((error) => {
    console.error("Project picture discovery failed", error)
  })
  await reclaimStaleThumbnails().catch((error) => {
    console.error("Project picture reclaim failed", error)
  })
  void drainQueue()
}

/**
 * Every project with no row yet, or saved since its row was last checked.
 * `checked_at` takes the `updated_at` that was read, never the clock, so a
 * save landing while this runs is newer than it and is looked at next tick.
 */
export async function discoverChangedProjects() {
  const rows = await db
    .select({
      id: videoProjects.id,
      updatedAt: videoProjects.updatedAt,
      timeline: videoProjects.timeline,
      thumbnail: videoProjectThumbnails,
    })
    .from(videoProjects)
    .leftJoin(
      videoProjectThumbnails,
      eq(videoProjectThumbnails.projectId, videoProjects.id)
    )
    .where(
      or(
        isNull(videoProjectThumbnails.projectId),
        // Stored times carry microseconds and a JS date only milliseconds, so
        // both sides are compared at milliseconds or a row is never settled.
        gt(
          sql`date_trunc('milliseconds', ${videoProjects.updatedAt})`,
          videoProjectThumbnails.checkedAt
        )
      )
    )
    .orderBy(videoProjects.updatedAt)
    .limit(DISCOVER_BATCH)

  for (const row of rows) {
    const source = firstPictureSource(parseTimelineForReset(row.timeline).timeline)
    const current = row.thumbnail
    const unchanged =
      current &&
      current.sourceMediaId === (source?.mediaId ?? null) &&
      current.sourceAtMs === (source?.atMs ?? null)

    if (unchanged) {
      await db
        .update(videoProjectThumbnails)
        .set({ checkedAt: row.updatedAt })
        .where(eq(videoProjectThumbnails.projectId, row.id))
      continue
    }

    const at = now()
    if (!current) {
      await db
        .insert(videoProjectThumbnails)
        .values({
          projectId: row.id,
          status: source ? "queued" : "none",
          sourceMediaId: source?.mediaId ?? null,
          sourceAtMs: source?.atMs ?? null,
          checkedAt: row.updatedAt,
          createdAt: at,
          updatedAt: at,
        })
        .onConflictDoNothing()
    } else if (source) {
      // A new first clip starts a fresh count of tries. The old picture stays
      // on the list until the new one replaces it.
      await db
        .update(videoProjectThumbnails)
        .set({
          status: "queued",
          sourceMediaId: source.mediaId,
          sourceAtMs: source.atMs,
          attempts: 0,
          error: null,
          leaseToken: null,
          leaseExpiresAt: null,
          checkedAt: row.updatedAt,
          updatedAt: at,
        })
        .where(eq(videoProjectThumbnails.projectId, row.id))
    } else {
      await clearThumbnail(row.id, row.updatedAt)
    }
  }
}

/**
 * Nothing left to take a picture of, so the old picture goes too. The path to
 * delete is read under the row lock, so a picture that finished a moment ago
 * is the one removed rather than left in storage with nothing pointing at it.
 */
async function clearThumbnail(projectId: string, checkedAt: Date) {
  const result = await db.execute(sql`
    update video_project_thumbnails t set
      status = 'none',
      source_media_id = null,
      source_at_ms = null,
      storage_path = null,
      attempts = 0,
      error = null,
      lease_token = null,
      lease_expires_at = null,
      checked_at = ${checkedAt},
      updated_at = now()
    from (
      select project_id, storage_path from video_project_thumbnails
      where project_id = ${projectId}
      for update
    ) old
    where t.project_id = old.project_id
    returning old.storage_path
  `)
  const oldPath = (result.rows[0] as { storage_path: string | null } | undefined)
    ?.storage_path
  if (oldPath) {
    await deleteFromR2(oldPath).catch((error) => {
      console.error("Old project picture removal failed", projectId, error)
    })
  }
}

async function reclaimStaleThumbnails() {
  await db.execute(sql`
    update video_project_thumbnails set
      status = case when attempts < ${MAX_ATTEMPTS} then 'queued' else 'error' end,
      error = case when attempts < ${MAX_ATTEMPTS} then null
        else ${FRAME_FAILED_MESSAGE} end,
      lease_token = null,
      lease_expires_at = null,
      updated_at = now()
    where status = 'generating' and lease_expires_at < now()
  `)
}

/** One picture at a time until the queue is empty; ticks never overlap it. */
async function drainQueue() {
  const state = workerState()
  if (state.draining) return
  state.draining = true
  try {
    for (;;) {
      const job = await claimNextThumbnail()
      if (!job) break
      await makeThumbnail(job)
    }
  } catch (error) {
    console.error("Project picture queue failed", error)
  } finally {
    state.draining = false
  }
}

type ClaimedThumbnail = {
  projectId: string
  userId: string
  mediaId: string
  atMs: number
  attempts: number
  previousPath: string | null
  leaseToken: string
}

async function claimNextThumbnail(): Promise<ClaimedThumbnail | null> {
  const leaseToken = uuid()
  const result = await db.execute(sql`
    update video_project_thumbnails t set
      status = 'generating',
      attempts = attempts + 1,
      error = null,
      lease_token = ${leaseToken},
      lease_expires_at = now() + make_interval(secs => ${LEASE_SECONDS}),
      updated_at = now()
    from video_projects p
    where p.id = t.project_id
      and t.project_id = (
        select project_id from video_project_thumbnails
        where status = 'queued'
        order by updated_at, project_id
        limit 1
        for update skip locked
      )
    returning t.project_id, t.attempts, t.source_media_id, t.source_at_ms,
      t.storage_path, p.user_id
  `)
  const row = result.rows[0] as
    | {
        project_id: string
        attempts: number
        source_media_id: string
        source_at_ms: number
        storage_path: string | null
        user_id: string
      }
    | undefined
  if (!row) return null
  return {
    projectId: row.project_id,
    userId: row.user_id,
    mediaId: row.source_media_id,
    atMs: row.source_at_ms,
    attempts: row.attempts,
    previousPath: row.storage_path,
    leaseToken,
  }
}

/**
 * Keeps the claim alive while a slow download runs, the same as the media
 * worker does, so a large upload with no playback copy yet is not taken back
 * halfway through.
 */
function startHeartbeat(job: ClaimedThumbnail) {
  const interval = setInterval(() => {
    void db
      .execute(
        sql`
          update video_project_thumbnails set
            lease_expires_at = now() + make_interval(secs => ${LEASE_SECONDS})
          where project_id = ${job.projectId}
            and lease_token = ${job.leaseToken}
            and status = 'generating'
        `
      )
      .catch(() => undefined)
  }, HEARTBEAT_MS)
  interval.unref()
  return interval
}

async function makeThumbnail(job: ClaimedThumbnail) {
  const heartbeat = startHeartbeat(job)
  const workDir = await mkdtemp(join(tmpdir(), "video-project-thumb-"))
  try {
    const frame = await grabFrame(job, workDir)
    // A new name each time, so no cache can keep handing back the old one.
    const storagePath = `video/project-thumbnails/${job.userId}/${job.projectId}/${job.leaseToken}.jpg`
    await uploadToR2(storagePath, frame, "image/jpeg")

    const finished = await db
      .update(videoProjectThumbnails)
      .set({
        status: "ready",
        storagePath,
        error: null,
        leaseToken: null,
        leaseExpiresAt: null,
        generatedAt: now(),
        updatedAt: now(),
      })
      .where(
        and(
          eq(videoProjectThumbnails.projectId, job.projectId),
          eq(videoProjectThumbnails.leaseToken, job.leaseToken),
          eq(videoProjectThumbnails.status, "generating")
        )
      )
      .returning({ projectId: videoProjectThumbnails.projectId })
    // No match means the first clip changed, or the project was deleted,
    // while ffmpeg ran: the file just uploaded belongs to nobody.
    const stale = finished.length ? job.previousPath : storagePath
    if (stale) await deleteFromR2(stale).catch(() => undefined)
  } catch (error) {
    await recordFailure(job, error)
  } finally {
    clearInterval(heartbeat)
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined)
  }
}

/**
 * The frame itself, 320 across at most. A video is read from its 720p
 * playback copy when there is one, which is far smaller than the upload.
 * Only the project owner's own file is ever read.
 */
async function grabFrame(job: ClaimedThumbnail, workDir: string) {
  const [media] = await db
    .select({
      storagePath: customShellMedia.storagePath,
      fileType: customShellMedia.fileType,
      proxyPath: videoMediaProxies.storagePath,
      proxyStatus: videoMediaProxies.status,
    })
    .from(customShellMedia)
    .leftJoin(videoMediaProxies, eq(videoMediaProxies.mediaId, customShellMedia.id))
    .where(
      and(
        eq(customShellMedia.id, job.mediaId),
        eq(customShellMedia.userId, job.userId)
      )
    )
    .limit(1)
  if (!media) throw new Error(SOURCE_GONE_MESSAGE)

  const sourcePath =
    media.fileType === "video" && media.proxyStatus === "ready" && media.proxyPath
      ? media.proxyPath
      : media.storagePath
  const inputPath = join(workDir, "input")
  await downloadToFile(sourcePath, inputPath)

  const outputPath = join(workDir, "thumbnail.jpg")
  await runFfmpeg(
    [
      ...(media.fileType === "video" ? ["-ss", String(job.atMs / 1000)] : []),
      "-i",
      inputPath,
      "-frames:v",
      "1",
      "-vf",
      "scale=320:320:force_original_aspect_ratio=decrease:force_divisible_by=2",
      "-q:v",
      "4",
      outputPath,
    ],
    FRAME_FAILED_MESSAGE,
    undefined,
    FRAME_TIMEOUT_MS
  )
  return readFile(outputPath)
}

/**
 * A missing file is final at once, since trying again reads the same missing
 * file. Anything else gets three tries in all, then stops for good until the
 * first clip changes.
 */
async function recordFailure(job: ClaimedThumbnail, error: unknown) {
  const message =
    error instanceof Error &&
    (error.message === SOURCE_GONE_MESSAGE ||
      error.message === FFMPEG_MISSING_MESSAGE)
      ? error.message
      : FRAME_FAILED_MESSAGE
  if (message === FRAME_FAILED_MESSAGE) {
    console.error("Project picture failed", job.projectId, error)
  }
  const retry = job.attempts < MAX_ATTEMPTS && message !== SOURCE_GONE_MESSAGE
  await db
    .update(videoProjectThumbnails)
    .set({
      status: retry ? "queued" : "error",
      error: retry ? null : message,
      leaseToken: null,
      leaseExpiresAt: null,
      updatedAt: now(),
    })
    .where(
      and(
        eq(videoProjectThumbnails.projectId, job.projectId),
        eq(videoProjectThumbnails.leaseToken, job.leaseToken),
        eq(videoProjectThumbnails.status, "generating")
      )
    )
    .catch(() => undefined)
}
