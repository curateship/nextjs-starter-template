import { coverFromMainThumbnail } from "@/server/video/thumbnails"
import { and, count, desc, eq, inArray, sql } from "drizzle-orm"

import {
  EXPORT_SHAPES,
  EXPORT_TITLE_MAX,
  NO_ACTIVE_EXPORT_MESSAGE,
  NO_SHAPE_MESSAGE,
  ONLY_FAILED_RETRY_MESSAGE,
  QUEUE_FULL_MESSAGE,
  RENDER_NOT_FOUND_MESSAGE,
  shapeBusyMessage,
  type RenderFrameRate,
  type RenderQuality,
  type RenderStatus,
} from "@/lib/video/render"
import { DEFAULT_NORMALIZE_LOUDNESS } from "@/lib/video/audio-loudness"
import type { CarouselFormat } from "@/lib/video/carousel-schema"
import type { AiPart } from "@/lib/video/ai-parts"
import { scenesOfTimeline } from "@/lib/video/export-scenes"
import { adsOfTimeline } from "@/lib/video/ads"
import type { TimelineMarker } from "@/lib/video/timeline-markers"
import { withIntroOutro } from "@/lib/video/intro-outro"
import { introOutroParts } from "@/server/video/intro-outro"
import {
  requireCanonicalTimeline,
  type AspectRatio,
} from "@/lib/video/timeline-schema"
import { now, uuid } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import { publishNotificationCreated } from "@/server/notifications/events"
import { customShellNotifications } from "@/server/schema"
import {
  deleteFromR2,
  uploadFileToR2,
  uploadToR2,
} from "@/server/media/storage"
import { VIDEO_NOT_FOUND_MESSAGE } from "@/lib/video/project-videos"
import {
  RENDER_FAILED_MESSAGE,
  renderRefusalReason,
  renderTimeline,
  SAFE_RENDER_ERRORS,
  timelineEndMs,
  type RenderResult,
} from "@/server/video/render"
import { workOutAiParts } from "@/server/video/ai-parts"
import { getOwnedVideo } from "@/server/video/project-videos"
import { videoProjectVideos, videoRenderJobs } from "@/server/video/schema"
import { isUniqueViolation } from "@/server/video/unique-violation"
import { stretchRefusal, timelineStretch } from "@/lib/video/export-stretch"
import { DISK_WAIT_MS, isDiskFullError } from "@/server/video/disk-space"

/**
 * The export queue.
 *
 * Asking for an export inserts a row. A worker claims the oldest waiting row
 * with `for update skip locked`, so two workers can never take the same one,
 * and holds a lease it renews while ffmpeg runs. Anything whose lease has run
 * out was being rendered by a process that is no longer there, and is put back
 * — which is how a render survives a restart without ever running twice.
 *
 * Each export row carries its own shape, so one project can wait in the queue
 * as a tall, a square and a wide export at the same time. The partial unique
 * index allows one active export per project and shape.
 *
 * Stopping a render is a write to the row, never a signal to a process. The
 * worker rendering it reads its row every second, and once the row is no
 * longer its own it kills its own ffmpeg. That works whichever process the
 * render is in, including the separate `npm run worker` program.
 *
 * The worker rides the shell's fifteen-second ticker, registered alongside the
 * media builders in `src/app/server-options.ts`.
 */

// How many renders may run at once on this server. One by default: ffmpeg will
// happily eat every core it is given.
const RENDER_CONCURRENCY = Math.max(
  1,
  Number.parseInt(process.env.VIDEO_RENDER_CONCURRENCY || "1", 10) || 1
)
// Interrupted once (a restart mid-render) it is retried; twice and it stops.
// Pressing Try again on a failed export starts the count again from nothing.
const MAX_ATTEMPTS = 2
// One person cannot fill the queue without end and starve everybody else.
// Twenty exports of long projects is still hours of rendering.
const MAX_ACTIVE_JOBS_PER_USER = 20
const LEASE_SECONDS = 60
const HEARTBEAT_MS = 20_000
// How often a render looks at its own row to see whether it was stopped. A
// read of one row by its key, so a second costs nothing and the next export
// in line starts about a second after the stop.
const STOP_CHECK_MS = 1_000

export const INTERRUPTED_MESSAGE =
  "The server restarted while this was rendering"

export type RenderJobSummary = {
  id: string
  /** `carousel` for a kept carousel ZIP; see `carousel-exports.ts`. */
  kind: "video" | "carousel"
  /** Always set on a video export, never on a carousel export. */
  project_id: string | null
  project_name: string | null
  /** The video exported. Always set on a video export. */
  video_id: string | null
  video_name: string | null
  /**
   * When the video is a language copy: the language it speaks, and the
   * video it was translated from while that still exists.
   */
  language: string | null
  original_video_id: string | null
  original_video_name: string | null
  /** The carousel a carousel export came from, until it is deleted. */
  carousel_id: string | null
  carousel_name: string | null
  /** How many slides a carousel export holds. Null for a video. */
  slide_count: number | null
  status: RenderStatus
  quality: RenderQuality
  aspect: AspectRatio | CarouselFormat
  frame_rate: RenderFrameRate
  error_message: string | null
  /** Where this sits in the person's own queue, while it is waiting. */
  queue_position: number | null
  title: string | null
  description: string | null
  /** What the AI made in the file. Null before 20 Oct 2026 and on carousels. */
  ai_parts: AiPart[] | null
  /** Whether the copied paragraph says the script and pictures were edited. */
  ai_hand_edited: boolean
  /** The markers in the file, for its chapters. Null before 4 Nov 2026 and on carousels. */
  markers: TimelineMarker[] | null
  file_size: number | null
  duration_ms: number | null
  width: number | null
  height: number | null
  has_thumbnail: boolean
  /** The part of the project exported, or null for the whole of it. */
  range: { start_ms: number; end_ms: number } | null
  created_at: string
  finished_at: string | null
}

type JobRow = typeof videoRenderJobs.$inferSelect

export function serializeRenderJob(
  row: JobRow,
  names: { project: string | null; video: string | null } = { project: null, video: null },
  carouselName: string | null = null,
  copy: {
    language: string | null
    originalId: string | null
    originalName: string | null
  } | null = null
): RenderJobSummary {
  return {
    id: row.id,
    kind: row.kind === "carousel" ? "carousel" : "video",
    project_id: row.projectId,
    project_name: names.project,
    video_id: row.videoId,
    video_name: names.video,
    language: copy?.language ?? null,
    original_video_id: copy?.originalId ?? null,
    original_video_name: copy?.originalName ?? null,
    carousel_id: row.carouselId,
    carousel_name: carouselName,
    slide_count: row.slideRanges ? row.slideRanges.length : null,
    status: row.status as RenderStatus,
    quality: row.quality as RenderQuality,
    aspect: row.aspect as AspectRatio | CarouselFormat,
    frame_rate: row.frameRate as RenderFrameRate,
    error_message: row.errorMessage,
    queue_position: null,
    title: row.title,
    description: row.description,
    ai_parts: row.aiParts,
    ai_hand_edited: row.aiHandEdited,
    markers: row.markers,
    file_size: row.fileSize,
    duration_ms: row.durationMs,
    width: row.width,
    height: row.height,
    has_thumbnail: !!row.thumbnailStoragePath,
    range:
      row.rangeStartMs !== null && row.rangeEndMs !== null
        ? { start_ms: row.rangeStartMs, end_ms: row.rangeEndMs }
        : null,
    created_at: row.createdAt.toISOString(),
    finished_at: row.finishedAt ? row.finishedAt.toISOString() : null,
  }
}

/** The first of these shapes this video already has waiting or rendering. */
async function findBusyShape(
  videoId: string,
  aspects: AspectRatio[],
  database: CustomShellDb
) {
  const [job] = await database
    .select({ aspect: videoRenderJobs.aspect })
    .from(videoRenderJobs)
    .where(
      and(
        eq(videoRenderJobs.videoId, videoId),
        inArray(videoRenderJobs.aspect, aspects),
        inArray(videoRenderJobs.status, ["queued", "running"])
      )
    )
    .limit(1)
  return (job?.aspect as AspectRatio | undefined) ?? null
}

/** Refuses when this many more would take the person past their limit. */
export async function refuseFullQueue(
  userId: string,
  adding: number,
  database: CustomShellDb
) {
  const [{ value: active }] = await database
    .select({ value: count() })
    .from(videoRenderJobs)
    .where(
      and(
        eq(videoRenderJobs.userId, userId),
        inArray(videoRenderJobs.status, ["queued", "running"])
      )
    )
  if (active + adding > MAX_ACTIVE_JOBS_PER_USER) {
    throw new Error(QUEUE_FULL_MESSAGE)
  }
}

/** How many places from the front this person's waiting export is. */
async function queuePosition(job: JobRow, database: CustomShellDb) {
  if (job.status !== "queued") return null
  const [row] = await database
    .select({ ahead: count() })
    .from(videoRenderJobs)
    .where(
      and(
        eq(videoRenderJobs.userId, job.userId),
        eq(videoRenderJobs.status, "queued"),
        sql`(${videoRenderJobs.createdAt}, ${videoRenderJobs.id}) <= (${job.createdAt}, ${job.id})`
      )
    )
  return row?.ahead && row.ahead > 0 ? row.ahead : null
}

async function withPosition(job: JobRow, database: CustomShellDb) {
  return {
    ...serializeRenderJob(job),
    queue_position: await queuePosition(job, database),
  }
}

const SHAPE_ORDER = EXPORT_SHAPES.map((shape) => shape.id)

/**
 * What the editor watches: the newest export of this video in each shape it
 * has ever been exported in, listed in the dialog's shape order. Empty before
 * anything is asked for.
 */
export async function getLatestRenderJobs(
  userId: string,
  videoId: string,
  database: CustomShellDb = db
): Promise<RenderJobSummary[]> {
  await getOwnedVideo(userId, videoId, database)
  const rows = await database
    .selectDistinctOn([videoRenderJobs.aspect])
    .from(videoRenderJobs)
    .where(
      and(
        eq(videoRenderJobs.userId, userId),
        eq(videoRenderJobs.videoId, videoId)
      )
    )
    .orderBy(
      videoRenderJobs.aspect,
      desc(videoRenderJobs.createdAt),
      desc(videoRenderJobs.id)
    )
  rows.sort(
    (a, b) =>
      SHAPE_ORDER.indexOf(a.aspect as AspectRatio) -
      SHAPE_ORDER.indexOf(b.aspect as AspectRatio)
  )
  return Promise.all(rows.map((row) => withPosition(row, database)))
}

/**
 * Ask for one export per shape, all in one press. Nothing is queued unless
 * every shape can be: a shape this video already has waiting or rendering
 * refuses the whole press and names that shape. The partial unique index keeps
 * that true when two requests arrive together, and because the rows go in as
 * one statement, a refusal there leaves none of them behind.
 */
export async function enqueueRenderJobs({
  userId,
  videoId,
  aspects,
  quality,
  frameRate,
  normalizeLoudness,
  title,
  range,
  withIntroOutro: includeIntroOutro = true,
  database = db,
}: {
  userId: string
  videoId: string
  aspects: AspectRatio[]
  quality: RenderQuality
  frameRate: RenderFrameRate
  normalizeLoudness?: boolean
  /** What to call them. Left out, they take the video's name. */
  title?: string
  /** The part of the project to export. Left out, the whole project. */
  range?: { startMs: number; endMs: number }
  /** Off leaves out the project's intro and outro. A part never has them. */
  withIntroOutro?: boolean
  database?: CustomShellDb
}): Promise<RenderJobSummary[]> {
  const shapes = Array.from(new Set(aspects))
  if (!shapes.length) throw new Error(NO_SHAPE_MESSAGE)
  const video = await getOwnedVideo(userId, videoId, database)

  const busy = await findBusyShape(videoId, shapes, database)
  if (busy) throw new Error(shapeBusyMessage(busy))

  // Checked now so the answer is immediate; checked again when the render
  // starts, because the timeline can change in between.
  const refusal = renderRefusalReason(video.timeline)
  if (refusal) throw new Error(refusal)
  const part = range ? wholeMs(range) : null
  if (part) {
    const outOfRange = stretchRefusal(
      part.startMs,
      part.endMs,
      timelineEndMs(requireCanonicalTimeline(video.timeline).tracks)
    )
    if (outOfRange) throw new Error(outOfRange)
  }

  await refuseFullQueue(userId, shapes.length, database)

  const timestamp = now()
  const normalize = normalizeLoudness ?? DEFAULT_NORMALIZE_LOUDNESS
  const name = title?.trim().slice(0, EXPORT_TITLE_MAX) || video.name
  try {
    await database.insert(videoRenderJobs).values(
      shapes.map((aspect) => ({
        id: uuid(),
        userId,
        projectId: video.projectId,
        videoId,
        status: "queued",
        quality,
        aspect,
        frameRate,
        normalizeLoudness: normalize,
        title: name,
        rangeStartMs: part?.startMs ?? null,
        rangeEndMs: part?.endMs ?? null,
        withIntroOutro: includeIntroOutro,
        createdAt: timestamp,
        updatedAt: timestamp,
      }))
    )
  } catch (error) {
    if (!isUniqueViolation(error)) throw error
    // Somebody else asked for one of these shapes at the same instant and won.
    const winner = await findBusyShape(videoId, shapes, database)
    throw new Error(winner ? shapeBusyMessage(winner) : RENDER_FAILED_MESSAGE)
  }

  kickRenderWorker()
  return getLatestRenderJobs(userId, videoId, database)
}

/** A part of the project in whole milliseconds, which the columns hold. */
function wholeMs(range: { startMs: number; endMs: number }) {
  return { startMs: Math.round(range.startMs), endMs: Math.round(range.endMs) }
}

/** What a stopped export's row becomes: cancelled, and its lease let go. */
function stoppedRow() {
  return {
    status: "cancelled",
    leaseToken: null,
    leaseExpiresAt: null,
    finishedAt: now(),
    updatedAt: now(),
  }
}

/**
 * Stop one export that is waiting or rendering, and leave the video's
 * other exports going. The worker making it notices within a second, the same
 * way as below.
 */
export async function cancelRenderJob(
  userId: string,
  exportId: string,
  database: CustomShellDb = db
): Promise<RenderJobSummary> {
  const [cancelled] = await database
    .update(videoRenderJobs)
    .set(stoppedRow())
    .where(
      and(
        eq(videoRenderJobs.id, exportId),
        eq(videoRenderJobs.userId, userId),
        inArray(videoRenderJobs.status, ["queued", "running"])
      )
    )
    .returning()
  if (!cancelled) throw new Error(NO_ACTIVE_EXPORT_MESSAGE)
  return serializeRenderJob(cancelled)
}

/**
 * Stop every export of this video that is waiting or rendering, whatever its
 * shape. Each row ends here, and its lease goes with it. A worker rendering one
 * notices within a second, kills its ffmpeg and throws away what it made, so
 * nothing reaches storage.
 */
export async function cancelRenderJobs(
  userId: string,
  videoId: string,
  database: CustomShellDb = db
): Promise<RenderJobSummary[]> {
  await getOwnedVideo(userId, videoId, database)
  const cancelled = await database
    .update(videoRenderJobs)
    .set(stoppedRow())
    .where(
      and(
        eq(videoRenderJobs.userId, userId),
        eq(videoRenderJobs.videoId, videoId),
        inArray(videoRenderJobs.status, ["queued", "running"])
      )
    )
    .returning({ id: videoRenderJobs.id })
  if (!cancelled.length) throw new Error(NO_ACTIVE_EXPORT_MESSAGE)
  return getLatestRenderJobs(userId, videoId, database)
}

/**
 * Put a failed export back in the queue exactly as it was asked for: the same
 * shape, quality, sound setting and name. It renders the video as it is now,
 * like any export. The error goes, the attempt count starts again, and it joins
 * the back of the queue rather than jumping ahead of exports asked for since.
 */
export async function retryRenderJob(
  userId: string,
  exportId: string,
  database: CustomShellDb = db
): Promise<RenderJobSummary> {
  const [job] = await database
    .select()
    .from(videoRenderJobs)
    .where(
      and(eq(videoRenderJobs.id, exportId), eq(videoRenderJobs.userId, userId))
    )
    .limit(1)
  if (!job) throw new Error(RENDER_NOT_FOUND_MESSAGE)
  // A carousel export is never a failed row, and has no video to render.
  if (job.status !== "error" || !job.videoId) {
    throw new Error(ONLY_FAILED_RETRY_MESSAGE)
  }
  const aspect = job.aspect as AspectRatio

  if (await findBusyShape(job.videoId, [aspect], database)) {
    throw new Error(shapeBusyMessage(aspect))
  }
  const video = await getOwnedVideo(userId, job.videoId, database)
  const refusal = renderRefusalReason(video.timeline)
  if (refusal) throw new Error(refusal)
  await refuseFullQueue(userId, 1, database)

  const timestamp = now()
  let retried: JobRow | undefined
  try {
    ;[retried] = await database
      .update(videoRenderJobs)
      .set({
        status: "queued",
        errorMessage: null,
        attempts: 0,
        leaseToken: null,
        leaseExpiresAt: null,
        startedAt: null,
        finishedAt: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .where(
        and(
          eq(videoRenderJobs.id, exportId),
          eq(videoRenderJobs.userId, userId),
          eq(videoRenderJobs.status, "error")
        )
      )
      .returning()
  } catch (error) {
    if (!isUniqueViolation(error)) throw error
    throw new Error(shapeBusyMessage(aspect))
  }
  // Somebody pressed it twice, or deleted it, between the read and the write.
  if (!retried) throw new Error(ONLY_FAILED_RETRY_MESSAGE)

  kickRenderWorker()
  return withPosition(retried, database)
}

// ---------------------------------------------------------------------------
// The worker
// ---------------------------------------------------------------------------

type ClaimedJob = {
  id: string
  user_id: string
  video_id: string
  quality: RenderQuality
  aspect: AspectRatio
  frame_rate: RenderFrameRate
  normalize_loudness: boolean
  lease_token: string
  range_start_ms: number | null
  with_intro_outro: boolean
  range_end_ms: number | null
}

// How many renders this process has going. It lives on globalThis because the
// dev server reloads modules and a second copy of this count would let it run
// more at once than asked for.
const globals = globalThis as typeof globalThis & {
  __videoRenderActive?: { count: number; live: boolean; diskWaitUntil?: number }
}
const workerState = (globals.__videoRenderActive ??= { count: 0, live: false })

/**
 * Rides the shell's ticker: put back what was orphaned, then take what is next.
 *
 * Reaching this is also what marks the worker as live. A process that never
 * runs the ticker — a script, a test — has no business claiming jobs and
 * running ffmpeg, so asking for an export there only writes the row.
 */
export async function videoRenderTick() {
  workerState.live = true
  await reclaimStaleJobs()
  await pumpRenderQueue()
}

export function kickRenderWorker() {
  if (!workerState.live) return
  void pumpRenderQueue().catch((error) => {
    console.error("Render queue pump failed", error)
  })
}

async function pumpRenderQueue() {
  // A render that found the disk too full holds every export back a minute.
  if (Date.now() < (workerState.diskWaitUntil ?? 0)) return
  while (workerState.count < RENDER_CONCURRENCY) {
    const job = await claimNextJob()
    if (!job) return
    workerState.count += 1
    void runJob(job)
      .catch((error) => {
        console.error("Render job crashed", job.id, error)
      })
      .finally(() => {
        workerState.count -= 1
        void pumpRenderQueue().catch(() => undefined)
      })
  }
}

/** The oldest waiting job, claimed in one statement so nobody else can take it. */
async function claimNextJob(): Promise<ClaimedJob | null> {
  const result = await db.execute(sql`
    update video_render_jobs set
      status = 'running',
      attempts = attempts + 1,
      lease_token = ${uuid()},
      lease_expires_at = now() + make_interval(secs => ${LEASE_SECONDS}),
      started_at = coalesce(started_at, now()),
      updated_at = now()
    where id = (
      select id from video_render_jobs
      where status = 'queued'
      order by created_at, id
      limit 1
      for update skip locked
    )
    returning id, user_id, video_id, quality, aspect, frame_rate, normalize_loudness, lease_token,
      range_start_ms, range_end_ms, with_intro_outro
  `)
  return (result.rows[0] as ClaimedJob | undefined) ?? null
}

/**
 * Whether this run still owns its row. Stopped, lost to another worker, or
 * deleted along with its project all read the same: the work is no longer
 * wanted.
 */
async function stillOwnsJob(job: ClaimedJob) {
  const [row] = await db
    .select({ id: videoRenderJobs.id })
    .from(videoRenderJobs)
    .where(
      and(
        eq(videoRenderJobs.id, job.id),
        eq(videoRenderJobs.leaseToken, job.lease_token),
        eq(videoRenderJobs.status, "running")
      )
    )
    .limit(1)
  return !!row
}

async function runJob(job: ClaimedJob) {
  // Everything this run put in storage. If the row does not end up pointing at
  // it — the lease was lost, or the finishing write failed — it is rubbish
  // nobody can reach, so it is thrown away rather than left to pile up.
  const uploaded: string[] = []
  // The finished file, on disk until it is stored; its folder goes at the end
  // whatever happened.
  let result: RenderResult | null = null

  // Fires when the row stops being this run's. It kills ffmpeg and stops the
  // run before it uploads anything.
  const stop = new AbortController()
  const stopCheck = setInterval(() => {
    void stillOwnsJob(job)
      .then((owned) => {
        if (!owned) stop.abort()
      })
      .catch((error) => {
        // A database hiccup is not a stop. The lease covers a longer outage.
        console.error("Render stop check failed", job.id, error)
      })
  }, STOP_CHECK_MS)
  stopCheck.unref()

  // Renew the lease while ffmpeg works. The token guard means a lease this
  // process has already lost can never be brought back to life.
  const heartbeat = setInterval(() => {
    void db
      .execute(
        sql`
          update video_render_jobs set
            lease_expires_at = now() + make_interval(secs => ${LEASE_SECONDS}),
            updated_at = now()
          where id = ${job.id}
            and lease_token = ${job.lease_token}
            and status = 'running'
        `
      )
      .catch((error) => {
        console.error("Render heartbeat failed", job.id, error)
      })
  }, HEARTBEAT_MS)
  heartbeat.unref()

  try {
    const [video] = await db
      .select()
      .from(videoProjectVideos)
      .where(eq(videoProjectVideos.id, job.video_id))
      .limit(1)
    if (!video) throw new Error(VIDEO_NOT_FOUND_MESSAGE)

    // From the timeline this run draws, not the one the export was asked
    // for: the video can be edited while the export waits in the queue.
    const whole = requireCanonicalTimeline(video.timeline)
    // A part of the project is cut out before anything else reads it, so the
    // file, its AI parts and its scene lines all describe the part.
    // The video's own intro and outro (a template's), or else the
    // project's, go round a whole export, unless the
    // Export window's switch left them off; a part never gets them
    // (intro-and-outro.md).
    const drawn =
      job.range_start_ms !== null && job.range_end_ms !== null
        ? timelineStretch(whole, job.range_start_ms, job.range_end_ms)
        : job.with_intro_outro
          ? withIntroOutro(whole, await introOutroParts(job.user_id, video.projectId, db, video))
          : whole
    const aiParts = await workOutAiParts(drawn)

    result = await renderTimeline({
      userId: job.user_id,
      timeline: drawn,
      aspect: job.aspect,
      quality: job.quality,
      frameRate: job.frame_rate,
      normalizeLoudness: job.normalize_loudness,
      signal: stop.signal,
    })

    // The name carries the job id, so a re-export is a new address and no
    // cache anywhere can hand back the old file.
    const storagePath = `video/exports/${job.user_id}/${job.id}.mp4`
    stop.signal.throwIfAborted()
    // Pushed first: a stop can land while the upload is under way, and a file
    // that arrives after it must still be found and deleted.
    uploaded.push(storagePath)
    // From disk in pieces: an hour-long export is several gigabytes, past
    // what Node holds in memory at once.
    await uploadFileToR2(storagePath, result.filePath, "video/mp4")
    let thumbnailStoragePath: string | null = null
    if (result.thumbnail) {
      stop.signal.throwIfAborted()
      thumbnailStoragePath = `video/export-covers/${job.user_id}/${job.id}.jpg`
      uploaded.push(thumbnailStoragePath)
      await uploadToR2(thumbnailStoragePath, result.thumbnail, "image/jpeg")
    }

    const finished = await db
      .update(videoRenderJobs)
      .set({
        status: "ready",
        errorMessage: null,
        storagePath,
        fileSize: result.fileSize,
        thumbnailStoragePath,
        durationMs: result.durationMs,
        width: result.width,
        height: result.height,
        aiParts,
        // Kept with the file, so the retention curve's scene lines stay where
        // they were when it was made (workspace/docs/retention-curve.md).
        scenes: scenesOfTimeline(drawn, result.durationMs),
        // And where its ads were, for the marks on that curve (ads.md).
        ads: adsOfTimeline(drawn.tracks, result.durationMs),
        // And its markers, for the Chapters card (youtube-chapters.md).
        markers: drawn.markers ?? [],
        leaseToken: null,
        leaseExpiresAt: null,
        finishedAt: now(),
        updatedAt: now(),
      })
      .where(
        and(
          eq(videoRenderJobs.id, job.id),
          eq(videoRenderJobs.leaseToken, job.lease_token),
          eq(videoRenderJobs.status, "running")
        )
      )
      .returning({ id: videoRenderJobs.id })

    // The lease was taken away while this was rendering, so somebody else owns
    // the job now. Throw away what this run made rather than leaving a file
    // nothing points at.
    if (!finished.length) {
      await discardUploads(uploaded)
    } else {
      // A main thumbnail of this shape is the cover (thumbnails.md).
      await coverFromMainThumbnail(job.user_id, job.video_id, job.aspect).catch((coverError) =>
        console.error("Covering an export with its thumbnail failed", job.id, coverError)
      )
      await noticeExport({ id: job.id, userId: job.user_id }, "ready")
    }
  } catch (error) {
    await discardUploads(uploaded)
    // The row was stopped or taken away, and whoever did that has already
    // written how it ended. There is no failure to record.
    if (stop.signal.aborted) {
      console.info("Render stopped", job.id)
      return
    }
    if (isDiskFullError(error)) {
      await waitForDisk(job, error.message)
      return
    }
    console.error("Render failed", job.id, error)
    const message =
      error instanceof Error && SAFE_RENDER_ERRORS.has(error.message)
        ? error.message
        : RENDER_FAILED_MESSAGE
    const failed = await db
      .update(videoRenderJobs)
      .set({
        status: "error",
        errorMessage: message,
        leaseToken: null,
        leaseExpiresAt: null,
        finishedAt: now(),
        updatedAt: now(),
      })
      .where(
        and(
          eq(videoRenderJobs.id, job.id),
          eq(videoRenderJobs.leaseToken, job.lease_token),
          eq(videoRenderJobs.status, "running")
        )
      )
      .returning({ id: videoRenderJobs.id })
    if (failed.length) await noticeExport({ id: job.id, userId: job.user_id }, "failed")
  } finally {
    clearInterval(stopCheck)
    clearInterval(heartbeat)
    await result?.dispose().catch(() => undefined)
  }
}

/**
 * Puts an export that found the disk too full back at its place in the
 * queue, without using up a try, and holds the queue for a minute. The reason
 * stays on the row while it waits.
 */
async function waitForDisk(job: ClaimedJob, message: string) {
  console.warn("Render waiting for disk", job.id, message)
  workerState.diskWaitUntil = Date.now() + DISK_WAIT_MS
  await db
    .update(videoRenderJobs)
    .set({
      status: "queued",
      attempts: sql`greatest(${videoRenderJobs.attempts} - 1, 0)`,
      errorMessage: message,
      leaseToken: null,
      leaseExpiresAt: null,
      updatedAt: now(),
    })
    .where(
      and(
        eq(videoRenderJobs.id, job.id),
        eq(videoRenderJobs.leaseToken, job.lease_token),
        eq(videoRenderJobs.status, "running")
      )
    )
}

/** Files this run put in storage that nothing ended up pointing at. */
async function discardUploads(storagePaths: string[]) {
  for (const storagePath of storagePaths) {
    await deleteFromR2(storagePath).catch(() => undefined)
  }
}

/**
 * Anything left running by a process that is no longer here. It goes back in
 * the queue, unless it has already been interrupted twice — at which point
 * saying so is more use than trying forever.
 */
async function reclaimStaleJobs() {
  const result = await db.execute(sql`
    update video_render_jobs set
      status = case when attempts < ${MAX_ATTEMPTS} then 'queued' else 'error' end,
      error_message = case when attempts < ${MAX_ATTEMPTS} then error_message else ${INTERRUPTED_MESSAGE} end,
      lease_token = null,
      lease_expires_at = null,
      finished_at = case when attempts < ${MAX_ATTEMPTS} then null else now() end,
      updated_at = now()
    where status = 'running' and lease_expires_at < now()
    returning id, user_id, status
  `)
  const given = result.rows as { id: string; user_id: string; status: string }[]
  for (const row of given) {
    if (row.status === "error") await noticeExport({ id: row.id, userId: row.user_id }, "failed")
  }
}

/**
 * Tells the owner in the bell that an export is ready or has failed, with its
 * name and shape. Only a video export: a carousel export is made while its
 * window waits, so its owner is already looking. A stopped export sends
 * nothing, because the owner stopped it. Written up in
 * workspace/docs/export-notices.md.
 */
async function noticeExport(job: { id: string; userId: string }, outcome: "ready" | "failed") {
  try {
    const [row] = await db
      .select({
        kind: videoRenderJobs.kind,
        title: videoRenderJobs.title,
        aspect: videoRenderJobs.aspect,
        videoName: videoProjectVideos.name,
      })
      .from(videoRenderJobs)
      .leftJoin(videoProjectVideos, eq(videoProjectVideos.id, videoRenderJobs.videoId))
      .where(eq(videoRenderJobs.id, job.id))
      .limit(1)
    if (!row || row.kind !== "video") return
    const words = exportNoticeWords({
      name: row.title || row.videoName || "Your video",
      aspect: row.aspect,
      outcome,
    })
    await db.insert(customShellNotifications).values({
      id: uuid(),
      recipientUserId: job.userId,
      type: "app_activity",
      message: words.message,
      detail: words.detail,
      createdAt: now(),
    })
    await publishNotificationCreated(job.userId)
  } catch (error) {
    // A notice is a nicety; the export itself is ready or failed either way.
    console.error("Export notice failed", job.id, error)
  }
}

/** The two lines of an export notice. */
export function exportNoticeWords(input: {
  name: string
  aspect: string
  outcome: "ready" | "failed"
}) {
  const shape = EXPORT_SHAPES.find((item) => item.id === input.aspect)?.label ?? input.aspect
  return input.outcome === "ready"
    ? {
        message: `${input.name} (${shape}) is ready`,
        detail: "Download or share it from the Exports page.",
      }
    : {
        message: `${input.name} (${shape}) could not be exported`,
        detail: "The Exports page says why, and Try again is there.",
      }
}
