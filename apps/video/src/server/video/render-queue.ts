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
  type RenderQuality,
  type RenderStatus,
} from "@/lib/video/render"
import type { AspectRatio } from "@/lib/video/timeline-schema"
import { now, uuid } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import { deleteFromR2, uploadToR2 } from "@/server/media/storage"
import { PROJECT_NOT_FOUND_MESSAGE } from "@/lib/video/projects"
import {
  RENDER_FAILED_MESSAGE,
  renderRefusalReason,
  renderTimeline,
  SAFE_RENDER_ERRORS,
} from "@/server/video/render"
import { videoProjects, videoRenderJobs } from "@/server/video/schema"
import { getVideoBrandKit } from "@/server/video/settings"
import { isUniqueViolation } from "@/server/video/unique-violation"

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
// One person cannot fill the queue for an hour and starve everybody else.
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
  project_id: string
  project_name: string | null
  status: RenderStatus
  quality: RenderQuality
  aspect: AspectRatio
  error_message: string | null
  /** Where this sits in the person's own queue, while it is waiting. */
  queue_position: number | null
  title: string | null
  description: string | null
  file_size: number | null
  duration_ms: number | null
  width: number | null
  height: number | null
  has_thumbnail: boolean
  created_at: string
  finished_at: string | null
}

type JobRow = typeof videoRenderJobs.$inferSelect

export function serializeRenderJob(
  row: JobRow,
  projectName: string | null = null
): RenderJobSummary {
  return {
    id: row.id,
    project_id: row.projectId,
    project_name: projectName,
    status: row.status as RenderStatus,
    quality: row.quality as RenderQuality,
    aspect: row.aspect as AspectRatio,
    error_message: row.errorMessage,
    queue_position: null,
    title: row.title,
    description: row.description,
    file_size: row.fileSize,
    duration_ms: row.durationMs,
    width: row.width,
    height: row.height,
    has_thumbnail: !!row.thumbnailStoragePath,
    created_at: row.createdAt.toISOString(),
    finished_at: row.finishedAt ? row.finishedAt.toISOString() : null,
  }
}

async function getOwnedProject(
  userId: string,
  projectId: string,
  database: CustomShellDb
) {
  const [row] = await database
    .select()
    .from(videoProjects)
    .where(and(eq(videoProjects.id, projectId), eq(videoProjects.userId, userId)))
    .limit(1)
  if (!row) throw new Error(PROJECT_NOT_FOUND_MESSAGE)
  return row
}

/** The first of these shapes this project already has waiting or rendering. */
async function findBusyShape(
  projectId: string,
  aspects: AspectRatio[],
  database: CustomShellDb
) {
  const [job] = await database
    .select({ aspect: videoRenderJobs.aspect })
    .from(videoRenderJobs)
    .where(
      and(
        eq(videoRenderJobs.projectId, projectId),
        inArray(videoRenderJobs.aspect, aspects),
        inArray(videoRenderJobs.status, ["queued", "running"])
      )
    )
    .limit(1)
  return (job?.aspect as AspectRatio | undefined) ?? null
}

/** Refuses when this many more would take the person past their limit. */
async function refuseFullQueue(
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
 * What the editor watches: the newest export of this project in each shape it
 * has ever been exported in, listed in the dialog's shape order. Empty before
 * anything is asked for.
 */
export async function getLatestRenderJobs(
  userId: string,
  projectId: string,
  database: CustomShellDb = db
): Promise<RenderJobSummary[]> {
  await getOwnedProject(userId, projectId, database)
  const rows = await database
    .selectDistinctOn([videoRenderJobs.aspect])
    .from(videoRenderJobs)
    .where(
      and(
        eq(videoRenderJobs.userId, userId),
        eq(videoRenderJobs.projectId, projectId)
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
 * every shape can be: a shape this project already has waiting or rendering
 * refuses the whole press and names that shape. The partial unique index keeps
 * that true when two requests arrive together, and because the rows go in as
 * one statement, a refusal there leaves none of them behind.
 */
export async function enqueueRenderJobs({
  userId,
  projectId,
  aspects,
  quality,
  normalizeLoudness,
  title,
  database = db,
}: {
  userId: string
  projectId: string
  aspects: AspectRatio[]
  quality: RenderQuality
  normalizeLoudness?: boolean
  /** What to call them. Left out, they take the project's name. */
  title?: string
  database?: CustomShellDb
}): Promise<RenderJobSummary[]> {
  const shapes = Array.from(new Set(aspects))
  if (!shapes.length) throw new Error(NO_SHAPE_MESSAGE)
  const project = await getOwnedProject(userId, projectId, database)

  const busy = await findBusyShape(projectId, shapes, database)
  if (busy) throw new Error(shapeBusyMessage(busy))

  // Checked now so the answer is immediate; checked again when the render
  // starts, because the timeline can change in between.
  const refusal = renderRefusalReason(project.timeline)
  if (refusal) throw new Error(refusal)

  await refuseFullQueue(userId, shapes.length, database)

  const timestamp = now()
  const normalize =
    normalizeLoudness ?? (await getVideoBrandKit(database)).normalizeLoudness
  const name = title?.trim().slice(0, EXPORT_TITLE_MAX) || project.name
  try {
    await database.insert(videoRenderJobs).values(
      shapes.map((aspect) => ({
        id: uuid(),
        userId,
        projectId,
        status: "queued",
        quality,
        aspect,
        normalizeLoudness: normalize,
        title: name,
        createdAt: timestamp,
        updatedAt: timestamp,
      }))
    )
  } catch (error) {
    if (!isUniqueViolation(error)) throw error
    // Somebody else asked for one of these shapes at the same instant and won.
    const winner = await findBusyShape(projectId, shapes, database)
    throw new Error(winner ? shapeBusyMessage(winner) : RENDER_FAILED_MESSAGE)
  }

  kickRenderWorker()
  return getLatestRenderJobs(userId, projectId, database)
}

/**
 * Stop every export of this project that is waiting or rendering, whatever its
 * shape. Each row ends here, and its lease goes with it. A worker rendering one
 * notices within a second, kills its ffmpeg and throws away what it made, so
 * nothing reaches storage.
 */
export async function cancelRenderJobs(
  userId: string,
  projectId: string,
  database: CustomShellDb = db
): Promise<RenderJobSummary[]> {
  await getOwnedProject(userId, projectId, database)
  const cancelled = await database
    .update(videoRenderJobs)
    .set({
      status: "cancelled",
      leaseToken: null,
      leaseExpiresAt: null,
      finishedAt: now(),
      updatedAt: now(),
    })
    .where(
      and(
        eq(videoRenderJobs.userId, userId),
        eq(videoRenderJobs.projectId, projectId),
        inArray(videoRenderJobs.status, ["queued", "running"])
      )
    )
    .returning({ id: videoRenderJobs.id })
  if (!cancelled.length) throw new Error(NO_ACTIVE_EXPORT_MESSAGE)
  return getLatestRenderJobs(userId, projectId, database)
}

/**
 * Put a failed export back in the queue exactly as it was asked for: the same
 * shape, quality, sound setting and name. It renders the project as it is now,
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
  if (job.status !== "error") throw new Error(ONLY_FAILED_RETRY_MESSAGE)
  const aspect = job.aspect as AspectRatio

  if (await findBusyShape(job.projectId, [aspect], database)) {
    throw new Error(shapeBusyMessage(aspect))
  }
  const project = await getOwnedProject(userId, job.projectId, database)
  const refusal = renderRefusalReason(project.timeline)
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
  project_id: string
  quality: RenderQuality
  aspect: AspectRatio
  normalize_loudness: boolean
  lease_token: string
}

// How many renders this process has going. It lives on globalThis because the
// dev server reloads modules and a second copy of this count would let it run
// more at once than asked for.
const globals = globalThis as typeof globalThis & {
  __videoRenderActive?: { count: number; live: boolean }
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
    returning id, user_id, project_id, quality, aspect, normalize_loudness, lease_token
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
    const [project] = await db
      .select()
      .from(videoProjects)
      .where(eq(videoProjects.id, job.project_id))
      .limit(1)
    if (!project) throw new Error(PROJECT_NOT_FOUND_MESSAGE)

    const result = await renderTimeline({
      userId: job.user_id,
      timeline: project.timeline,
      aspect: job.aspect,
      quality: job.quality,
      brandKit: await getVideoBrandKit(),
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
    await uploadToR2(storagePath, result.bytes, "video/mp4")
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
        fileSize: result.bytes.byteLength,
        thumbnailStoragePath,
        durationMs: result.durationMs,
        width: result.width,
        height: result.height,
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
    if (!finished.length) await discardUploads(uploaded)
  } catch (error) {
    await discardUploads(uploaded)
    // The row was stopped or taken away, and whoever did that has already
    // written how it ended. There is no failure to record.
    if (stop.signal.aborted) {
      console.info("Render stopped", job.id)
      return
    }
    console.error("Render failed", job.id, error)
    const message =
      error instanceof Error && SAFE_RENDER_ERRORS.has(error.message)
        ? error.message
        : RENDER_FAILED_MESSAGE
    await db
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
  } finally {
    clearInterval(stopCheck)
    clearInterval(heartbeat)
  }
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
  await db.execute(sql`
    update video_render_jobs set
      status = case when attempts < ${MAX_ATTEMPTS} then 'queued' else 'error' end,
      error_message = case when attempts < ${MAX_ATTEMPTS} then error_message else ${INTERRUPTED_MESSAGE} end,
      lease_token = null,
      lease_expires_at = null,
      finished_at = case when attempts < ${MAX_ATTEMPTS} then null else now() end,
      updated_at = now()
    where status = 'running' and lease_expires_at < now()
  `)
}
