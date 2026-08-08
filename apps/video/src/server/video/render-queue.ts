import { and, count, desc, eq, inArray, sql } from "drizzle-orm"

import {
  EXPORT_TITLE_MAX,
  NO_QUEUED_EXPORT_MESSAGE,
  QUEUE_FULL_MESSAGE,
  type RenderQuality,
  type RenderStatus,
} from "@/lib/video/render"
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

/**
 * The export queue.
 *
 * Asking for an export inserts a row. A worker claims the oldest waiting row
 * with `for update skip locked`, so two workers can never take the same one,
 * and holds a lease it renews while ffmpeg runs. Anything whose lease has run
 * out was being rendered by a process that is no longer there, and is put back
 * — which is how a render survives a restart without ever running twice.
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
const MAX_ATTEMPTS = 2
// One person cannot fill the queue for an hour and starve everybody else.
const MAX_ACTIVE_JOBS_PER_USER = 20
const LEASE_SECONDS = 60
const HEARTBEAT_MS = 20_000

export const INTERRUPTED_MESSAGE =
  "The server restarted while this was rendering"

export type RenderJobSummary = {
  id: string
  project_id: string
  project_name: string | null
  status: RenderStatus
  quality: RenderQuality
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

async function findActiveJob(
  userId: string,
  projectId: string,
  database: CustomShellDb
) {
  const [job] = await database
    .select()
    .from(videoRenderJobs)
    .where(
      and(
        eq(videoRenderJobs.userId, userId),
        eq(videoRenderJobs.projectId, projectId),
        inArray(videoRenderJobs.status, ["queued", "running"])
      )
    )
    .limit(1)
  return job ?? null
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

/** The export a project is waiting on or last produced, or nothing. */
export async function getLatestRenderJob(
  userId: string,
  projectId: string,
  database: CustomShellDb = db
): Promise<RenderJobSummary | null> {
  await getOwnedProject(userId, projectId, database)
  const [job] = await database
    .select()
    .from(videoRenderJobs)
    .where(
      and(
        eq(videoRenderJobs.userId, userId),
        eq(videoRenderJobs.projectId, projectId)
      )
    )
    .orderBy(desc(videoRenderJobs.createdAt), desc(videoRenderJobs.id))
    .limit(1)
  return job ? withPosition(job, database) : null
}

/**
 * Ask for an export. Asking again while one is already waiting or running
 * hands back that one rather than starting a second: the partial unique index
 * makes that true even when two requests arrive together.
 */
export async function enqueueRenderJob({
  userId,
  projectId,
  quality,
  normalizeLoudness,
  title,
  database = db,
}: {
  userId: string
  projectId: string
  quality: RenderQuality
  normalizeLoudness?: boolean
  /** What to call this one. Left out, it takes the project's name. */
  title?: string
  database?: CustomShellDb
}): Promise<RenderJobSummary> {
  const project = await getOwnedProject(userId, projectId, database)

  const existing = await findActiveJob(userId, projectId, database)
  if (existing) return withPosition(existing, database)

  // Checked now so the answer is immediate; checked again when the render
  // starts, because the timeline can change in between.
  const refusal = renderRefusalReason(project.timeline)
  if (refusal) throw new Error(refusal)

  const [{ value: active }] = await database
    .select({ value: count() })
    .from(videoRenderJobs)
    .where(
      and(
        eq(videoRenderJobs.userId, userId),
        inArray(videoRenderJobs.status, ["queued", "running"])
      )
    )
  if (active >= MAX_ACTIVE_JOBS_PER_USER) {
    throw new Error(QUEUE_FULL_MESSAGE)
  }

  const timestamp = now()
  const [inserted] = await database
    .insert(videoRenderJobs)
    .values({
      id: uuid(),
      userId,
      projectId,
      status: "queued",
      quality,
      normalizeLoudness:
        normalizeLoudness ?? (await getVideoBrandKit(database)).normalizeLoudness,
      title: title?.trim().slice(0, EXPORT_TITLE_MAX) || project.name,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .onConflictDoNothing()
    .returning()

  if (!inserted) {
    // Somebody else asked at the same instant and won; theirs is the export.
    const winner = await findActiveJob(userId, projectId, database)
    if (!winner) throw new Error(RENDER_FAILED_MESSAGE)
    return withPosition(winner, database)
  }

  kickRenderWorker()
  return withPosition(inserted, database)
}

/**
 * Stop an export that has not started. One already rendering keeps going —
 * stopping ffmpeg partway is a different job, and a render takes minutes, not
 * hours.
 */
export async function cancelRenderJob(
  userId: string,
  projectId: string,
  database: CustomShellDb = db
): Promise<RenderJobSummary | null> {
  await getOwnedProject(userId, projectId, database)
  const [cancelled] = await database
    .update(videoRenderJobs)
    .set({ status: "cancelled", finishedAt: now(), updatedAt: now() })
    .where(
      and(
        eq(videoRenderJobs.userId, userId),
        eq(videoRenderJobs.projectId, projectId),
        eq(videoRenderJobs.status, "queued")
      )
    )
    .returning()
  if (!cancelled) throw new Error(NO_QUEUED_EXPORT_MESSAGE)
  return getLatestRenderJob(userId, projectId, database)
}

// ---------------------------------------------------------------------------
// The worker
// ---------------------------------------------------------------------------

type ClaimedJob = {
  id: string
  user_id: string
  project_id: string
  quality: RenderQuality
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
    returning id, user_id, project_id, quality, normalize_loudness, lease_token
  `)
  return (result.rows[0] as ClaimedJob | undefined) ?? null
}

async function runJob(job: ClaimedJob) {
  // Everything this run put in storage. If the row does not end up pointing at
  // it — the lease was lost, or the finishing write failed — it is rubbish
  // nobody can reach, so it is thrown away rather than left to pile up.
  const uploaded: string[] = []

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
      quality: job.quality,
      brandKit: await getVideoBrandKit(),
      normalizeLoudness: job.normalize_loudness,
    })

    // The name carries the job id, so a re-export is a new address and no
    // cache anywhere can hand back the old file.
    const storagePath = `video/exports/${job.user_id}/${job.id}.mp4`
    await uploadToR2(storagePath, result.bytes, "video/mp4")
    uploaded.push(storagePath)
    let thumbnailStoragePath: string | null = null
    if (result.thumbnail) {
      thumbnailStoragePath = `video/export-covers/${job.user_id}/${job.id}.jpg`
      await uploadToR2(thumbnailStoragePath, result.thumbnail, "image/jpeg")
      uploaded.push(thumbnailStoragePath)
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
    console.error("Render failed", job.id, error)
    await discardUploads(uploaded)
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
