import { spawn } from "node:child_process"
import { createWriteStream } from "node:fs"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Readable } from "node:stream"
import { pipeline } from "node:stream/promises"
import { sql } from "drizzle-orm"

import { uuid } from "@/server/auth/security"
import { db } from "@/server/db"
import { deleteFromR2, getFromR2, uploadToR2 } from "@/server/media/storage"
import { resolveProxyConcurrency } from "@/server/video/media-worker-config"

/**
 * The background builder for playback proxies and filmstrips, riding the
 * shell's fifteen-second ticker as this app's one registered worker (see
 * `src/app/server-options.ts`).
 *
 * The queue is the two side tables themselves. Discovery inserts a `queued`
 * row for any library video that has none, claiming is one atomic UPDATE with
 * `for update skip locked`, and a claim holds a two-minute lease renewed by a
 * heartbeat — so a worker killed mid-build leaves a lease to reclaim, never a
 * stuck row and never a double build. The lease token doubles as the stored
 * filename, which is what makes "the guarded finish matched no rows, delete
 * what was just uploaded" safe.
 */

export const MEDIA_PROXY_PROFILE = "h264-720p"
export const MEDIA_FILMSTRIP_PROFILE = "jpeg-160h-v1"

const MAX_ATTEMPTS = 3
const LEASE_SECONDS = 120
const HEARTBEAT_MS = 30_000
const FFMPEG_TIMEOUT_MS = 30 * 60 * 1000
const FFPROBE_TIMEOUT_MS = 60 * 1000
const FILMSTRIP_FFMPEG_TIMEOUT_MS = 15 * 60 * 1000

const FILMSTRIP_MAX_FRAMES = 120
const FILMSTRIP_SECONDS_PER_FRAME = 2
const FILMSTRIP_MAX_COLUMNS = 10

type JobKind = "proxy" | "filmstrip"

type WorkerState = {
  active: number
  pumping: boolean
  nextKind: JobKind
}

declare global {
  var __videoMediaWorkerState: WorkerState | undefined
}

/**
 * On `globalThis` for the same reason as the shell's ticker flag: the dev
 * server reloads modules in place, and a module-scoped state would forget the
 * jobs already running.
 */
function workerState(): WorkerState {
  if (!globalThis.__videoMediaWorkerState) {
    globalThis.__videoMediaWorkerState = {
      active: 0,
      pumping: false,
      nextKind: "proxy",
    }
  }
  return globalThis.__videoMediaWorkerState
}

/** The tick registered with the shell. Each step fails alone. */
export async function videoMediaTick() {
  await discoverNewVideos().catch((error) => {
    console.error("Video media discovery failed", error)
  })
  await reclaimStaleJobs("video_media_proxies", "Proxy").catch((error) => {
    console.error("Proxy reclaim failed", error)
  })
  await reclaimStaleJobs("video_media_filmstrips", "Filmstrip").catch(
    (error) => {
      console.error("Filmstrip reclaim failed", error)
    }
  )
  pumpQueue()
}

/** Lets a route nudge the queue without waiting for the next tick. */
export function kickVideoMediaWorker() {
  pumpQueue()
}

/**
 * Any library video with no queue row gets one, queued. This is how uploads
 * enter the pipeline without touching the shell's upload code: within one
 * tick of arriving, a video is discovered here.
 */
async function discoverNewVideos() {
  await db.execute(sql`
    insert into video_media_proxies (media_id, status, profile, created_at, updated_at)
    select m.id, 'queued', ${MEDIA_PROXY_PROFILE}, now(), now()
    from media m
    where m.file_type = 'video'
      and not exists (select 1 from video_media_proxies p where p.media_id = m.id)
    on conflict (media_id) do nothing
  `)
  await db.execute(sql`
    insert into video_media_filmstrips (media_id, status, profile, created_at, updated_at)
    select m.id, 'queued', ${MEDIA_FILMSTRIP_PROFILE}, now(), now()
    from media m
    where m.file_type = 'video'
      and not exists (select 1 from video_media_filmstrips f where f.media_id = m.id)
    on conflict (media_id) do nothing
  `)
}

async function reclaimStaleJobs(
  table: "video_media_proxies" | "video_media_filmstrips",
  label: string
) {
  await db.execute(sql`
    update ${sql.raw(table)} set
      status = case when attempts < ${MAX_ATTEMPTS} then 'queued' else 'error' end,
      error = case when attempts < ${MAX_ATTEMPTS} then null
        else ${`${label} generation was interrupted`} end,
      lease_token = null,
      lease_expires_at = null,
      updated_at = now()
    where status = 'generating' and lease_expires_at < now()
  `)
}

function pumpQueue() {
  const state = workerState()
  if (state.pumping) return
  state.pumping = true
  void (async () => {
    try {
      const concurrency = resolveProxyConcurrency(
        process.env.VIDEO_PROXY_CONCURRENCY
      )
      while (state.active < concurrency) {
        const job = await claimNextJob(state)
        if (!job) break
        state.active += 1
        void runJob(job)
          .catch((error) => {
            console.error("Video media job crashed", error)
          })
          .finally(() => {
            state.active -= 1
            pumpQueue()
          })
      }
    } catch (error) {
      console.error("Video media pump failed", error)
    } finally {
      state.pumping = false
    }
  })()
}

type ClaimedJob = {
  kind: JobKind
  mediaId: string
  userId: string
  storagePath: string
  attempts: number
  leaseToken: string
}

/**
 * Proxies and filmstrips alternate so one long backlog cannot starve the
 * other; when one queue is empty the other gets the slot.
 */
async function claimNextJob(state: WorkerState): Promise<ClaimedJob | null> {
  const order: JobKind[] =
    state.nextKind === "proxy" ? ["proxy", "filmstrip"] : ["filmstrip", "proxy"]
  for (const kind of order) {
    const job = await claimFromTable(kind)
    if (job) {
      state.nextKind = kind === "proxy" ? "filmstrip" : "proxy"
      return job
    }
  }
  return null
}

async function claimFromTable(kind: JobKind): Promise<ClaimedJob | null> {
  const table = kind === "proxy" ? "video_media_proxies" : "video_media_filmstrips"
  const leaseToken = uuid()
  const result = await db.execute(sql`
    update ${sql.raw(table)} t set
      status = 'generating',
      attempts = attempts + 1,
      error = null,
      lease_token = ${leaseToken},
      lease_expires_at = now() + make_interval(secs => ${LEASE_SECONDS}),
      updated_at = now()
    from media m
    where m.id = t.media_id
      and t.media_id = (
        select media_id from ${sql.raw(table)}
        where status = 'queued'
        order by created_at, media_id
        limit 1
        for update skip locked
      )
    returning t.media_id, t.attempts, m.user_id, m.storage_path
  `)
  const row = result.rows[0] as
    | {
        media_id: string
        attempts: number
        user_id: string
        storage_path: string
      }
    | undefined
  if (!row) return null
  return {
    kind,
    mediaId: row.media_id,
    userId: row.user_id,
    storagePath: row.storage_path,
    attempts: row.attempts,
    leaseToken,
  }
}

function startHeartbeat(table: string, job: ClaimedJob) {
  const interval = setInterval(() => {
    void db
      .execute(
        sql`
          update ${sql.raw(table)} set
            lease_expires_at = now() + make_interval(secs => ${LEASE_SECONDS})
          where media_id = ${job.mediaId}
            and lease_token = ${job.leaseToken}
            and status = 'generating'
        `
      )
      .catch(() => undefined)
  }, HEARTBEAT_MS)
  interval.unref()
  return interval
}

async function runJob(job: ClaimedJob) {
  const table =
    job.kind === "proxy" ? "video_media_proxies" : "video_media_filmstrips"
  const heartbeat = startHeartbeat(table, job)
  const workDir = await mkdtemp(join(tmpdir(), "video-media-"))
  try {
    if (job.kind === "proxy") {
      await buildProxy(job, workDir)
    } else {
      await buildFilmstrip(job, workDir)
    }
  } catch (error) {
    await recordFailure(table, job, error)
  } finally {
    clearInterval(heartbeat)
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined)
  }
}

async function recordFailure(table: string, job: ClaimedJob, error: unknown) {
  const known =
    error instanceof Error &&
    (error.message === "ffmpeg is not installed" ||
      error.message === "ffprobe is not installed")
  const label = job.kind === "proxy" ? "Proxy" : "Filmstrip"
  const message = known
    ? (error as Error).message
    : `${label} generation failed`
  const retry = job.attempts < MAX_ATTEMPTS
  await db
    .execute(
      sql`
        update ${sql.raw(table)} set
          status = ${retry ? "queued" : "error"},
          error = ${retry ? null : message},
          lease_token = null,
          lease_expires_at = null,
          updated_at = now()
        where media_id = ${job.mediaId}
          and lease_token = ${job.leaseToken}
          and status = 'generating'
      `
    )
    .catch(() => undefined)
}

async function buildProxy(job: ClaimedJob, workDir: string) {
  const inputPath = join(workDir, "input")
  await downloadToFile(job.storagePath, inputPath)

  const outputPath = join(workDir, "proxy.mp4")
  // 720p cap that never upscales, a keyframe every second so the editor can
  // scrub, and subtitles/data streams stripped.
  await runCommand(
    "ffmpeg",
    [
      "-y",
      "-i",
      inputPath,
      "-map",
      "0:v:0",
      "-map",
      "0:a?",
      "-vf",
      "scale=-2:trunc(min(720\\,ih)/2)*2",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "26",
      "-pix_fmt",
      "yuv420p",
      "-g",
      "30",
      "-keyint_min",
      "1",
      "-sc_threshold",
      "0",
      "-force_key_frames",
      "expr:gte(t,n_forced*1)",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-movflags",
      "+faststart",
      "-sn",
      "-dn",
      outputPath,
    ],
    FFMPEG_TIMEOUT_MS
  )

  // The `video/` prefix keeps these keys outside the shell's orphan scanner,
  // which only considers `{userId}/...` upload keys as its own.
  const storagePath = `video/proxies/${job.userId}/${job.mediaId}/${job.leaseToken}.mp4`
  const bytes = await readFile(outputPath)
  await uploadToR2(storagePath, bytes, "video/mp4")

  const finished = await db.execute(sql`
    update video_media_proxies set
      status = 'ready',
      storage_path = ${storagePath},
      file_size = ${bytes.byteLength},
      error = null,
      lease_token = null,
      lease_expires_at = null,
      generated_at = now(),
      updated_at = now()
    where media_id = ${job.mediaId}
      and lease_token = ${job.leaseToken}
      and status = 'generating'
    returning media_id
  `)
  if (!finished.rows.length) {
    // Somebody reclaimed the lease while ffmpeg ran; the row is theirs now,
    // so the file just uploaded belongs to nobody.
    await deleteFromR2(storagePath).catch(() => undefined)
  }
}

async function buildFilmstrip(job: ClaimedJob, workDir: string) {
  // Prefer the 720p proxy as input — far faster to decode, and its frames are
  // already rotated the way ffmpeg will rotate them here.
  const proxy = await db.execute(sql`
    select storage_path from video_media_proxies
    where media_id = ${job.mediaId} and status = 'ready' and storage_path is not null
  `)
  const sourcePath =
    (proxy.rows[0] as { storage_path?: string } | undefined)?.storage_path ??
    job.storagePath

  const inputPath = join(workDir, "input")
  await downloadToFile(sourcePath, inputPath)

  const durationSeconds = await probeDurationSeconds(inputPath)
  const frameCount = Math.min(
    FILMSTRIP_MAX_FRAMES,
    Math.max(1, Math.round(durationSeconds / FILMSTRIP_SECONDS_PER_FRAME))
  )
  const columns = Math.min(FILMSTRIP_MAX_COLUMNS, frameCount)
  const rows = Math.ceil(frameCount / columns)

  const outputPath = join(workDir, "filmstrip.jpg")
  const filter = `fps=${frameCount}/${durationSeconds},scale=320:160:force_original_aspect_ratio=decrease:force_divisible_by=2,tile=${columns}x${rows}:nb_frames=${frameCount}:padding=0:margin=0`
  await runCommand(
    "ffmpeg",
    ["-y", "-i", inputPath, "-map", "0:v:0", "-vf", filter, "-frames:v", "1", "-c:v", "mjpeg", "-q:v", "6", outputPath],
    FILMSTRIP_FFMPEG_TIMEOUT_MS
  )

  // Measure the sprite rather than trusting a probe of the source: the sprite
  // is what ffmpeg actually produced, rotation and all. Guessing from the
  // source squished rotated phone clips in the app this ports from.
  const sprite = await probeDimensions(outputPath)
  const frameWidth = Math.max(2, Math.round(sprite.width / columns))
  const frameHeight = Math.max(2, Math.round(sprite.height / rows))
  const durationMs = Math.max(1, Math.round(durationSeconds * 1000))

  const storagePath = `video/filmstrips/${job.userId}/${job.mediaId}/${job.leaseToken}.jpg`
  await uploadToR2(storagePath, await readFile(outputPath), "image/jpeg")

  const finished = await db.execute(sql`
    update video_media_filmstrips set
      status = 'ready',
      storage_path = ${storagePath},
      frame_count = ${frameCount},
      frame_width = ${frameWidth},
      frame_height = ${frameHeight},
      columns = ${columns},
      duration_ms = ${durationMs},
      error = null,
      lease_token = null,
      lease_expires_at = null,
      generated_at = now(),
      updated_at = now()
    where media_id = ${job.mediaId}
      and lease_token = ${job.leaseToken}
      and status = 'generating'
    returning media_id
  `)
  if (!finished.rows.length) {
    await deleteFromR2(storagePath).catch(() => undefined)
  }
}

async function probeDurationSeconds(inputPath: string) {
  const output = await runCommand(
    "ffprobe",
    ["-v", "error", "-select_streams", "v:0", "-show_entries", "format=duration", "-of", "json", inputPath],
    FFPROBE_TIMEOUT_MS
  )
  const duration = Number(
    (JSON.parse(output) as { format?: { duration?: string } }).format?.duration
  )
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error("Could not read the video's duration")
  }
  return duration
}

async function probeDimensions(inputPath: string) {
  const output = await runCommand(
    "ffprobe",
    ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "json", inputPath],
    FFPROBE_TIMEOUT_MS
  )
  const stream = (
    JSON.parse(output) as { streams?: { width?: number; height?: number }[] }
  ).streams?.[0]
  if (!stream?.width || !stream.height) {
    throw new Error("Could not read the sprite's dimensions")
  }
  return { width: stream.width, height: stream.height }
}

async function downloadToFile(storagePath: string, filePath: string) {
  const object = await getFromR2(storagePath)
  if (!object.Body) {
    throw new Error("Stored file has no content")
  }
  await pipeline(
    bodyToReadable(object.Body),
    createWriteStream(filePath, { flags: "wx" })
  )
}

function bodyToReadable(body: unknown): Readable {
  if (body instanceof Readable) return body
  if (body instanceof Uint8Array) return Readable.from([body])
  const stream = (
    body as { transformToWebStream?: () => ReadableStream }
  ).transformToWebStream?.()
  if (stream) return Readable.fromWeb(stream as never)
  throw new Error("Failed to read stored file")
}

/**
 * Runs a command, keeps only the tail of its noise, and turns a missing
 * binary into the one sentence a person can act on.
 */
function runCommand(command: string, args: string[], timeoutMs: number) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      timeout: timeoutMs,
    })
    let stdout = ""
    let stderrTail = ""
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString()
    })
    child.stderr?.on("data", (chunk: Buffer) => {
      stderrTail = (stderrTail + chunk.toString()).slice(-4000)
    })
    child.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        reject(new Error(`${command} is not installed`))
      } else {
        reject(error)
      }
    })
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout)
      } else {
        reject(new Error(`${command} exited with ${code}: ${stderrTail}`))
      }
    })
  })
}
