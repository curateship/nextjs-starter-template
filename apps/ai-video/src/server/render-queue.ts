import { and, count, eq, inArray, sql } from "drizzle-orm"

import { db } from "@/server/db"
import { requireAppOrigin } from "@/server/origin"
import { aiVideoProjects, aiVideoRenderJobs } from "@/server/schema"
import { now, requireUser, uuid } from "@/server/security"
import {
  MAX_TIMELINE_MS,
  renderProject,
  timelineEndMs,
  type RenderQuality,
} from "@/server/video-render"
import {
  requireCanonicalTimeline,
  SAVED_TIMELINE_INVALID_MESSAGE,
} from "@/lib/timeline-schema"

// Durable render queue over the render_jobs table. Enqueue inserts a job (one
// active per project, enforced by a partial unique index), an in-process
// worker claims jobs with FOR UPDATE SKIP LOCKED under a concurrency cap, and
// leases + a periodic reclaim recover jobs orphaned by a crashed server. The
// video_projects render_* columns stay the "latest render" mirror the UI and
// exports gallery read.

const RENDER_CONCURRENCY = Math.max(
  1,
  Number.parseInt(process.env.AI_VIDEO_RENDER_CONCURRENCY || "1", 10) || 1
)
// A job interrupted once (server restart mid-render) is retried; twice → error.
const MAX_ATTEMPTS = 2
// Fairness cap: the claim order is global FIFO, so without a per-user ceiling
// one account could fill the queue for hours and starve everyone else.
const MAX_ACTIVE_JOBS_PER_USER = 20
const QUEUE_FULL_MESSAGE = "Too many exports queued"
const LEASE_SECONDS = 60
const HEARTBEAT_MS = 20_000
const TICK_MS = 15_000

const INTERRUPTED_MESSAGE = "Render was interrupted"

export type ProjectRenderInfo = {
  status: "idle" | "queued" | "rendering" | "ready" | "error"
  error: string | null
  rendered_at: string | null
  // 1-based place in the queue; only set while status is "queued".
  queue_position: number | null
}

export type BatchRenderItem = {
  project_id: string
  outcome: "queued" | "already_active" | "skipped"
  reason: string | null
  job_id: string | null
}

export type BatchRenderResponse = {
  results: BatchRenderItem[]
}

type ProjectRow = typeof aiVideoProjects.$inferSelect

async function getOwnedProject(userId: string, projectId: string) {
  const [row] = await db
    .select()
    .from(aiVideoProjects)
    .where(
      and(eq(aiVideoProjects.id, projectId), eq(aiVideoProjects.userId, userId))
    )
    .limit(1)
  if (!row) {
    throw new Error("Project not found")
  }
  return row
}

// Enqueue-time validation for instant feedback; renderProject revalidates at
// run time. Returns the user-safe rejection message, or null when renderable.
function preflightReason(row: ProjectRow): string | null {
  let durationMs: number
  try {
    const timeline = requireCanonicalTimeline(row.timeline)
    durationMs = timelineEndMs(timeline.tracks)
  } catch {
    return SAVED_TIMELINE_INVALID_MESSAGE
  }
  if (durationMs <= 0) return "Nothing to export"
  if (durationMs > MAX_TIMELINE_MS) return "Timeline too long to export"
  return null
}

async function findActiveJob(userId: string, projectId: string) {
  const [job] = await db
    .select({ id: aiVideoRenderJobs.id })
    .from(aiVideoRenderJobs)
    .where(
      and(
        eq(aiVideoRenderJobs.userId, userId),
        eq(aiVideoRenderJobs.projectId, projectId),
        inArray(aiVideoRenderJobs.status, ["queued", "running"])
      )
    )
    .limit(1)
  return job ?? null
}

async function countActiveJobs(userId: string) {
  const [row] = await db
    .select({ value: count() })
    .from(aiVideoRenderJobs)
    .where(
      and(
        eq(aiVideoRenderJobs.userId, userId),
        inArray(aiVideoRenderJobs.status, ["queued", "running"])
      )
    )
  return row?.value ?? 0
}

// Inserts a queued job unless the project already has one active. The partial
// unique index makes this race-proof: the loser of a duplicate race conflicts
// and reads back the winner's job.
async function insertRenderJob(
  userId: string,
  projectId: string,
  quality: RenderQuality,
  includeEndCard: boolean
): Promise<{ jobId: string | null; inserted: boolean }> {
  const timestamp = now()
  const [inserted] = await db
    .insert(aiVideoRenderJobs)
    .values({
      id: uuid(),
      userId,
      projectId,
      quality,
      includeEndCard,
      status: "queued",
      attempts: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .onConflictDoNothing({
      target: [aiVideoRenderJobs.projectId],
      // Matches ux_render_jobs_project_active's partial-index predicate.
      where: sql`status in ('queued', 'running')`,
    })
    .returning({ id: aiVideoRenderJobs.id })

  if (inserted) {
    await db
      .update(aiVideoProjects)
      .set({ renderStatus: "queued", renderError: null })
      .where(eq(aiVideoProjects.id, projectId))
    return { jobId: inserted.id, inserted: true }
  }

  const existing = await findActiveJob(userId, projectId)
  return { jobId: existing?.id ?? null, inserted: false }
}

// 1-based FIFO position among the owner's own queued jobs. Scoped per user so
// the number never discloses other tenants' queue activity; the worker's claim
// order is still global, so this can undercount the true wait when other
// accounts have jobs ahead (single-user deployments see the exact position).
async function queuePosition(projectId: string): Promise<number | null> {
  const [job] = await db
    .select({
      id: aiVideoRenderJobs.id,
      userId: aiVideoRenderJobs.userId,
      createdAt: aiVideoRenderJobs.createdAt,
    })
    .from(aiVideoRenderJobs)
    .where(
      and(
        eq(aiVideoRenderJobs.projectId, projectId),
        eq(aiVideoRenderJobs.status, "queued")
      )
    )
    .limit(1)
  if (!job) return null
  const result = await db.execute(sql`
    select count(*)::int as position
    from render_jobs
    where status = 'queued'
      and user_id = ${job.userId}
      and (created_at, id) <= (${job.createdAt}, ${job.id})
  `)
  const position = (result.rows[0] as { position?: number } | undefined)
    ?.position
  return typeof position === "number" && position > 0 ? position : null
}

async function serializeRenderInfo(row: ProjectRow): Promise<ProjectRenderInfo> {
  const status = (row.renderStatus as ProjectRenderInfo["status"]) ?? "idle"
  return {
    status,
    error: row.renderError,
    rendered_at: row.renderedAt ? row.renderedAt.toISOString() : null,
    queue_position: status === "queued" ? await queuePosition(row.id) : null,
  }
}

// Owned-project lookup + serialize, re-fetched so mutations return fresh state.
async function loadRenderInfo(userId: string, projectId: string) {
  return serializeRenderInfo(await getOwnedProject(userId, projectId))
}

export async function getProjectRenderForCurrentUser(
  projectId: string
): Promise<ProjectRenderInfo> {
  const user = await requireUser()
  return loadRenderInfo(user.id, projectId)
}

export async function enqueueProjectRenderForCurrentUser(
  projectId: string,
  quality: RenderQuality,
  includeEndCard: boolean
): Promise<ProjectRenderInfo> {
  requireAppOrigin()
  const user = await requireUser()
  const row = await getOwnedProject(user.id, projectId)

  const reason = preflightReason(row)
  if (reason) {
    throw new Error(reason)
  }

  // Re-exporting a project that's already queued/running stays idempotent —
  // the fairness cap only gates *new* jobs.
  if (!(await findActiveJob(user.id, projectId))) {
    if ((await countActiveJobs(user.id)) >= MAX_ACTIVE_JOBS_PER_USER) {
      throw new Error(QUEUE_FULL_MESSAGE)
    }
    await insertRenderJob(user.id, projectId, quality, includeEndCard)
    kickRenderWorker()
  }
  return loadRenderInfo(user.id, projectId)
}

export async function enqueueProjectRendersForCurrentUser(
  projectIds: string[],
  quality: RenderQuality,
  includeEndCard: boolean
): Promise<BatchRenderResponse> {
  requireAppOrigin()
  const user = await requireUser()

  const rows = projectIds.length
    ? await db
        .select()
        .from(aiVideoProjects)
        .where(
          and(
            eq(aiVideoProjects.userId, user.id),
            inArray(aiVideoProjects.id, projectIds)
          )
        )
    : []
  const rowsById = new Map(rows.map((row) => [row.id, row]))

  // Soft fairness cap: counted once, bumped per insert. Concurrent requests
  // can overshoot slightly; the cap is about fairness, not a hard invariant.
  let activeCount = await countActiveJobs(user.id)

  const skipped = (projectId: string, reason: string): BatchRenderItem => ({
    project_id: projectId,
    outcome: "skipped",
    reason,
    job_id: null,
  })

  const results: BatchRenderItem[] = []
  for (const projectId of projectIds) {
    const row = rowsById.get(projectId)
    if (!row) {
      results.push(skipped(projectId, "Project not found"))
      continue
    }
    const reason = preflightReason(row)
    if (reason) {
      results.push(skipped(projectId, reason))
      continue
    }
    const existing = await findActiveJob(user.id, projectId)
    if (existing) {
      results.push({
        project_id: projectId,
        outcome: "already_active",
        reason: null,
        job_id: existing.id,
      })
      continue
    }
    if (activeCount >= MAX_ACTIVE_JOBS_PER_USER) {
      results.push(skipped(projectId, QUEUE_FULL_MESSAGE))
      continue
    }
    const { jobId, inserted } = await insertRenderJob(
      user.id,
      projectId,
      quality,
      includeEndCard
    )
    if (inserted) activeCount += 1
    results.push({
      project_id: projectId,
      outcome: inserted ? "queued" : "already_active",
      reason: null,
      job_id: jobId,
    })
  }

  if (results.some((item) => item.outcome === "queued")) {
    kickRenderWorker()
  }
  return { results }
}

// Cancels a queued job (running renders can't be cancelled in v1 — that needs
// per-job ffmpeg process tracking). The WHERE status='queued' races safely
// against the claim: the row lock serializes them and exactly one wins.
export async function cancelProjectRenderForCurrentUser(
  projectId: string
): Promise<ProjectRenderInfo> {
  requireAppOrigin()
  const user = await requireUser()
  const row = await getOwnedProject(user.id, projectId)

  const cancelled = await db
    .update(aiVideoRenderJobs)
    .set({ status: "cancelled", finishedAt: now(), updatedAt: now() })
    .where(
      and(
        eq(aiVideoRenderJobs.projectId, projectId),
        eq(aiVideoRenderJobs.userId, user.id),
        eq(aiVideoRenderJobs.status, "queued")
      )
    )
    .returning({ id: aiVideoRenderJobs.id })
  if (!cancelled.length) {
    throw new Error("No queued export to cancel")
  }

  // Restore the mirror from durable evidence: a prior finished render means
  // the project is still "ready"; otherwise back to idle.
  const hasRender = !!row.renderStoragePath && !!row.renderedAt
  await db
    .update(aiVideoProjects)
    .set({
      renderStatus: hasRender ? "ready" : null,
      renderError: null,
    })
    .where(eq(aiVideoProjects.id, projectId))

  return loadRenderInfo(user.id, projectId)
}

// ---------------------------------------------------------------------------
// Worker
// ---------------------------------------------------------------------------

type ClaimedJob = {
  id: string
  user_id: string
  project_id: string
  quality: RenderQuality
  include_end_card: boolean
  lease_token: string
}

// Worker state lives on globalThis so dev HMR module reloads can't double-run
// jobs or leak extra tickers (same pattern as the creator-watch scheduler).
const WORKER_STATE_KEY = "__aiVideoRenderWorkerState"

type WorkerState = { registered: boolean; active: number }

function workerState(): WorkerState {
  const globals = globalThis as Record<string, unknown>
  if (!globals[WORKER_STATE_KEY]) {
    globals[WORKER_STATE_KEY] = {
      registered: false,
      active: 0,
    } satisfies WorkerState
  }
  return globals[WORKER_STATE_KEY] as WorkerState
}

// Always-on (renders are core functionality, unlike the opt-in creator watch).
// The interval is the safety net — enqueue kicks the pump directly.
export function registerRenderWorker() {
  const state = workerState()
  if (state.registered) return
  state.registered = true
  setInterval(() => {
    void tick()
  }, TICK_MS).unref()
  // Boot pass: reclaim jobs orphaned by the previous process, then pump.
  void tick()
}

export function kickRenderWorker() {
  void pumpRenderQueue().catch((error) => {
    console.error("Render queue pump failed", error)
  })
}

async function tick() {
  await reclaimStaleJobs().catch((error) => {
    console.error("Render queue reclaim failed", error)
  })
  await pumpRenderQueue().catch((error) => {
    console.error("Render queue pump failed", error)
  })
}

// Claims jobs until the concurrency cap is reached. Re-entrant safe: the
// claim is a single atomic statement and `active` is bumped before awaiting.
async function pumpRenderQueue() {
  const state = workerState()
  while (state.active < RENDER_CONCURRENCY) {
    const job = await claimNextJob()
    if (!job) return
    state.active += 1
    void runJob(job)
      .catch((error) => {
        console.error("Render job crashed", job.id, error)
      })
      .finally(() => {
        state.active -= 1
        void pumpRenderQueue().catch(() => undefined)
      })
  }
}

// Atomic FIFO claim — correct even with multiple server instances sharing the
// database (SKIP LOCKED keeps concurrent claimers off the same row).
async function claimNextJob(): Promise<ClaimedJob | null> {
  const result = await db.execute(sql`
    update render_jobs set
      status = 'running',
      attempts = attempts + 1,
      lease_token = ${uuid()},
      lease_expires_at = now() + make_interval(secs => ${LEASE_SECONDS}),
      started_at = coalesce(started_at, now()),
      updated_at = now()
    where id = (
      select id from render_jobs
      where status = 'queued'
      order by created_at, id
      limit 1
      for update skip locked
    )
    returning id, user_id, project_id, quality, include_end_card, lease_token
  `)
  return (result.rows[0] as ClaimedJob | undefined) ?? null
}

async function runJob(job: ClaimedJob) {
  await db
    .update(aiVideoProjects)
    .set({ renderStatus: "rendering", renderError: null })
    .where(eq(aiVideoProjects.id, job.project_id))

  // Keep the lease alive while ffmpeg runs; the token guard means a lease we
  // somehow lost (job reclaimed elsewhere) is never resurrected.
  const heartbeat = setInterval(() => {
    void db
      .execute(
        sql`
          update render_jobs set
            lease_expires_at = now() + make_interval(secs => ${LEASE_SECONDS}),
            updated_at = now()
          where id = ${job.id}
            and lease_token = ${job.lease_token}
            and status = 'running'
        `
      )
      .catch((error) => {
        console.error("Render job heartbeat failed", job.id, error)
      })
  }, HEARTBEAT_MS)
  heartbeat.unref()

  try {
    await renderProject(
      job.project_id,
      job.user_id,
      job.quality,
      job.include_end_card
    )
    await finishJob(job, {
      status: "ready",
      errorMessage: null,
    })
  } catch (error) {
    // renderProject already mirrored the error onto the project row.
    await finishJob(job, {
      status: "error",
      errorMessage:
        error instanceof Error && error.message
          ? error.message.slice(0, 500)
          : "Render failed",
    })
  } finally {
    clearInterval(heartbeat)
  }
}

// Terminal job update, guarded by the lease token so a reclaimed job's zombie
// run can't overwrite the retry's state. (The zombie's un-tokened project
// mirror / R2 writes are an accepted race: single-instance deployments only
// hit it after a stall, and both runs target the same R2 key.)
async function finishJob(
  job: ClaimedJob,
  outcome: { status: "ready" | "error"; errorMessage: string | null }
) {
  await db
    .update(aiVideoRenderJobs)
    .set({
      status: outcome.status,
      errorMessage: outcome.errorMessage,
      leaseToken: null,
      leaseExpiresAt: null,
      finishedAt: now(),
      updatedAt: now(),
    })
    .where(
      and(
        eq(aiVideoRenderJobs.id, job.id),
        eq(aiVideoRenderJobs.leaseToken, job.lease_token),
        eq(aiVideoRenderJobs.status, "running")
      )
    )
}

// Requeues running jobs whose lease expired (crashed or wedged process); a
// job interrupted MAX_ATTEMPTS times becomes a terminal error.
async function reclaimStaleJobs() {
  const result = await db.execute(sql`
    update render_jobs set
      status = case when attempts < ${MAX_ATTEMPTS} then 'queued' else 'error' end,
      error_message = case when attempts < ${MAX_ATTEMPTS} then error_message else ${INTERRUPTED_MESSAGE} end,
      lease_token = null,
      lease_expires_at = null,
      finished_at = case when attempts < ${MAX_ATTEMPTS} then null else now() end,
      updated_at = now()
    where status = 'running' and lease_expires_at < now()
    returning project_id, status
  `)
  const rows = result.rows as { project_id: string; status: string }[]
  for (const row of rows) {
    const requeued = row.status === "queued"
    await db
      .update(aiVideoProjects)
      .set({
        renderStatus: requeued ? "queued" : "error",
        renderError: requeued ? null : INTERRUPTED_MESSAGE,
      })
      .where(eq(aiVideoProjects.id, row.project_id))
  }
}
