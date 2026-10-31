import { spawn } from "node:child_process"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { sql } from "drizzle-orm"

import { uuid } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import { deleteFromR2, uploadToR2 } from "@/server/media/storage"
import { resolveProxyConcurrency } from "@/server/video/media-worker-config"
import { projectThumbnailTick } from "@/server/video/project-thumbnails"
import { downloadToFile } from "@/server/video/storage-files"
import { BEAT_SAMPLE_RATE, findBeats } from "@/lib/video/beats"
import {
  isVoiceCleanStrength,
  voiceCleanFilter,
} from "@/lib/video/voice-clean"
import {
  waveformPeaks,
  waveformPointCount,
} from "@/server/video/waveform-peaks"

/**
 * The background builder for playback proxies, filmstrips, waveforms,
 * cleaned sound and music beats, and the step that makes each project's
 * picture (`project-thumbnails.ts`),
 * riding the shell's fifteen-second ticker as this app's one registered worker
 * (see `src/app/server-options.ts`).
 *
 * The queue is the side tables themselves, one per kind of job. Discovery inserts a `queued`
 * row for any library video that has none, claiming is one atomic UPDATE with
 * `for update skip locked`, and a claim holds a two-minute lease renewed by a
 * heartbeat — so a worker killed mid-build leaves a lease to reclaim, never a
 * stuck row and never a double build. The lease token doubles as the stored
 * filename, which is what makes "the guarded finish matched no rows, delete
 * what was just uploaded" safe.
 */

export const MEDIA_PROXY_PROFILE = "h264-720p"
export const MEDIA_FILMSTRIP_PROFILE = "jpeg-160h-v1"
const MEDIA_WAVEFORM_PROFILE = "u8-peaks-25ps-v1"

const MAX_ATTEMPTS = 3
const LEASE_SECONDS = 120
const HEARTBEAT_MS = 30_000
const FFMPEG_TIMEOUT_MS = 30 * 60 * 1000
const FFPROBE_TIMEOUT_MS = 60 * 1000
const FILMSTRIP_FFMPEG_TIMEOUT_MS = 15 * 60 * 1000

const FILMSTRIP_MAX_FRAMES = 120
const FILMSTRIP_SECONDS_PER_FRAME = 2
const FILMSTRIP_MAX_COLUMNS = 10

// Low enough to keep a long file's decoded sound to a few megabytes a minute,
// still far more samples than the 25 points a second the timeline draws.
const WAVEFORM_SAMPLE_RATE = 8000
const WAVEFORM_FFMPEG_TIMEOUT_MS = 15 * 60 * 1000

type JobKind = "proxy" | "filmstrip" | "waveform" | "clean" | "beats"

const JOB_KINDS: JobKind[] = ["proxy", "filmstrip", "waveform", "clean", "beats"]

const JOB_TABLES = {
  proxy: "video_media_proxies",
  filmstrip: "video_media_filmstrips",
  waveform: "video_media_waveforms",
  clean: "video_media_clean_sounds",
  beats: "video_media_beats",
} as const satisfies Record<JobKind, string>

// The column a row is claimed by. Every queue has one row per file except
// cleaned sound, which has one per file and strength, keyed by both joined.
const JOB_KEYS: Record<JobKind, "media_id" | "id"> = {
  proxy: "media_id",
  filmstrip: "media_id",
  waveform: "media_id",
  clean: "id",
  beats: "media_id",
}

const JOB_LABELS: Record<JobKind, string> = {
  proxy: "Proxy",
  filmstrip: "Filmstrip",
  waveform: "Waveform",
  clean: "Cleaned sound",
  beats: "Beats",
}

const CLEAN_FFMPEG_TIMEOUT_MS = 15 * 60 * 1000
const BEATS_FFMPEG_TIMEOUT_MS = 15 * 60 * 1000

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
  for (const kind of JOB_KINDS) {
    await reclaimStaleJobs(kind).catch((error) => {
      console.error(`${JOB_LABELS[kind]} reclaim failed`, error)
    })
  }
  pumpQueue()
  // The projects list's pictures ride this tick too. Each of its steps
  // catches its own failure.
  await projectThumbnailTick()
}

/** Lets a route nudge the queue without waiting for the next tick. */
export function kickVideoMediaWorker() {
  pumpQueue()
}

/**
 * Puts a file's failed smooth copy and filmstrip back in the queue with a
 * fresh three tries. Only rows that ended in an error move, so a press while
 * one of them is still being built never restarts it. The caller checks the
 * file is the person's own, and nudges the queue afterwards.
 */
export async function requeueFailedPlaybackJobs(
  mediaId: string,
  database: CustomShellDb = db
) {
  for (const kind of ["proxy", "filmstrip"] as const) {
    await database.execute(sql`
      update ${sql.raw(JOB_TABLES[kind])} set
        status = 'queued',
        attempts = 0,
        error = null,
        lease_token = null,
        lease_expires_at = null,
        updated_at = now()
      where media_id = ${mediaId} and status = 'error'
    `)
  }
}

/**
 * Any library video with no queue row gets one, queued, and any video or
 * sound file gets a waveform row. This is how uploads enter the pipeline
 * without touching the shell's upload code: within one tick of arriving, a
 * file is discovered here.
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
  await db.execute(sql`
    insert into video_media_waveforms (media_id, status, profile, created_at, updated_at)
    select m.id, 'queued', ${MEDIA_WAVEFORM_PROFILE}, now(), now()
    from media m
    where m.file_type in ('video', 'audio')
      and not exists (select 1 from video_media_waveforms w where w.media_id = m.id)
    on conflict (media_id) do nothing
  `)
  // Beats only for files marked as music: nothing else is snapped to.
  await db.execute(sql`
    insert into video_media_beats (media_id, status, created_at, updated_at)
    select t.media_id, 'queued', now(), now()
    from video_music_tracks t
    where not exists (select 1 from video_media_beats b where b.media_id = t.media_id)
    on conflict (media_id) do nothing
  `)
}

async function reclaimStaleJobs(kind: JobKind) {
  await db.execute(sql`
    update ${sql.raw(JOB_TABLES[kind])} set
      status = case when attempts < ${MAX_ATTEMPTS} then 'queued' else 'error' end,
      error = case when attempts < ${MAX_ATTEMPTS} then null
        else ${`${JOB_LABELS[kind]} generation was interrupted`} end,
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
  /** The row's own key: the file's id, or `<file>:<strength>` for cleaned sound. */
  key: string
  mediaId: string
  userId: string
  storagePath: string
  attempts: number
  leaseToken: string
}

/**
 * The kinds take turns so one long backlog cannot starve the others;
 * when a queue is empty the next kind in line gets the slot.
 */
async function claimNextJob(state: WorkerState): Promise<ClaimedJob | null> {
  const start = JOB_KINDS.indexOf(state.nextKind)
  for (let offset = 0; offset < JOB_KINDS.length; offset += 1) {
    const index = (start + offset) % JOB_KINDS.length
    const job = await claimFromTable(JOB_KINDS[index])
    if (job) {
      state.nextKind = JOB_KINDS[(index + 1) % JOB_KINDS.length]
      return job
    }
  }
  return null
}

async function claimFromTable(kind: JobKind): Promise<ClaimedJob | null> {
  const table = JOB_TABLES[kind]
  const key = sql.raw(JOB_KEYS[kind])
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
      and t.${key} = (
        select ${key} from ${sql.raw(table)}
        where status = 'queued'
        order by created_at, ${key}
        limit 1
        for update skip locked
      )
    returning t.${key} as job_key, t.media_id, t.attempts, m.user_id, m.storage_path
  `)
  const row = result.rows[0] as
    | {
        job_key: string
        media_id: string
        attempts: number
        user_id: string
        storage_path: string
      }
    | undefined
  if (!row) return null
  return {
    kind,
    key: row.job_key,
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
          where ${sql.raw(JOB_KEYS[job.kind])} = ${job.key}
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
  const table = JOB_TABLES[job.kind]
  const heartbeat = startHeartbeat(table, job)
  const workDir = await mkdtemp(join(tmpdir(), "video-media-"))
  try {
    if (job.kind === "proxy") {
      await buildProxy(job, workDir)
    } else if (job.kind === "filmstrip") {
      await buildFilmstrip(job, workDir)
    } else if (job.kind === "clean") {
      await buildCleanSound(job, workDir)
    } else if (job.kind === "beats") {
      await buildBeats(job, workDir)
    } else {
      await buildWaveform(job, workDir)
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
      error.message === "ffprobe is not installed" ||
      error.message === NO_SOUND_TO_CLEAN_MESSAGE)
  const message = known
    ? (error as Error).message
    : `${JOB_LABELS[job.kind]} generation failed`
  // A file with no sound will have none on the next try either.
  const retry =
    job.attempts < MAX_ATTEMPTS &&
    !(error instanceof Error && error.message === NO_SOUND_TO_CLEAN_MESSAGE)
  await db
    .execute(
      sql`
        update ${sql.raw(table)} set
          status = ${retry ? "queued" : "error"},
          error = ${retry ? null : message},
          lease_token = null,
          lease_expires_at = null,
          updated_at = now()
        where ${sql.raw(JOB_KEYS[job.kind])} = ${job.key}
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

async function buildWaveform(job: ClaimedJob, workDir: string) {
  // A video's proxy carries the same sound in a far smaller file. A sound file
  // has no proxy, so this falls through to the upload itself.
  const proxy = await db.execute(sql`
    select storage_path from video_media_proxies
    where media_id = ${job.mediaId} and status = 'ready' and storage_path is not null
  `)
  const sourcePath =
    (proxy.rows[0] as { storage_path?: string } | undefined)?.storage_path ??
    job.storagePath

  const inputPath = join(workDir, "input")
  await downloadToFile(sourcePath, inputPath)

  let peaks = new Uint8Array(0)
  let durationMs: number | null = null
  if (await hasSoundTrack(inputPath)) {
    const outputPath = join(workDir, "sound.raw")
    await runCommand(
      "ffmpeg",
      ["-y", "-i", inputPath, "-map", "0:a:0", "-vn", "-ac", "1", "-ar", String(WAVEFORM_SAMPLE_RATE), "-f", "s16le", "-c:a", "pcm_s16le", outputPath],
      WAVEFORM_FFMPEG_TIMEOUT_MS
    )
    const pcm = await readFile(outputPath)
    const sampleCount = Math.floor(pcm.byteLength / 2)
    if (sampleCount > 0) {
      durationMs = Math.max(
        1,
        Math.round((sampleCount / WAVEFORM_SAMPLE_RATE) * 1000)
      )
      peaks = waveformPeaks(pcm, waveformPointCount(durationMs))
    }
  }

  await db.execute(sql`
    update video_media_waveforms set
      status = 'ready',
      peaks = ${Buffer.from(peaks).toString("base64")},
      point_count = ${peaks.length},
      duration_ms = ${durationMs},
      error = null,
      lease_token = null,
      lease_expires_at = null,
      generated_at = now(),
      updated_at = now()
    where media_id = ${job.mediaId}
      and lease_token = ${job.leaseToken}
      and status = 'generating'
  `)
}

export const NO_SOUND_TO_CLEAN_MESSAGE = "This file has no sound to clean"

/**
 * The smooth copy carries the same sound in a far smaller file, so a video's
 * sound jobs read it once it is ready. A sound file has no proxy.
 */
async function soundSourcePath(job: ClaimedJob) {
  const proxy = await db.execute(sql`
    select storage_path from video_media_proxies
    where media_id = ${job.mediaId} and status = 'ready' and storage_path is not null
  `)
  return (
    (proxy.rows[0] as { storage_path?: string } | undefined)?.storage_path ??
    job.storagePath
  )
}

/**
 * One file's whole sound, cleaned at the row's strength (voice-clean.ts), as
 * an M4A the preview plays in place of the file's own sound. The whole file,
 * not one clip, so every clip of it can share the copy however it is trimmed.
 */
async function buildCleanSound(job: ClaimedJob, workDir: string) {
  const strength = job.key.slice(job.key.lastIndexOf(":") + 1)
  if (!isVoiceCleanStrength(strength)) {
    throw new Error(`Unknown clean-up strength in ${job.key}`)
  }
  const inputPath = join(workDir, "input")
  await downloadToFile(await soundSourcePath(job), inputPath)
  if (!(await hasSoundTrack(inputPath))) {
    throw new Error(NO_SOUND_TO_CLEAN_MESSAGE)
  }

  const outputPath = join(workDir, "clean.m4a")
  await runCommand(
    "ffmpeg",
    ["-y", "-i", inputPath, "-map", "0:a:0", "-vn", "-af", voiceCleanFilter(strength), "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", outputPath],
    CLEAN_FFMPEG_TIMEOUT_MS
  )

  const storagePath = `video/clean-sound/${job.userId}/${job.mediaId}/${job.leaseToken}.m4a`
  await uploadToR2(storagePath, await readFile(outputPath), "audio/mp4")

  const finished = await db.execute(sql`
    update video_media_clean_sounds set
      status = 'ready',
      storage_path = ${storagePath},
      error = null,
      lease_token = null,
      lease_expires_at = null,
      generated_at = now(),
      updated_at = now()
    where id = ${job.key}
      and lease_token = ${job.leaseToken}
      and status = 'generating'
    returning id
  `)
  if (!finished.rows.length) {
    await deleteFromR2(storagePath).catch(() => undefined)
  }
}

/** Where the beats fall in one music file (beats.ts). */
async function buildBeats(job: ClaimedJob, workDir: string) {
  const inputPath = join(workDir, "input")
  await downloadToFile(await soundSourcePath(job), inputPath)

  let found: ReturnType<typeof findBeats> = { beats: [], tempo: null }
  if (await hasSoundTrack(inputPath)) {
    const outputPath = join(workDir, "sound.raw")
    await runCommand(
      "ffmpeg",
      ["-y", "-i", inputPath, "-map", "0:a:0", "-vn", "-ac", "1", "-ar", String(BEAT_SAMPLE_RATE), "-f", "f32le", "-c:a", "pcm_f32le", outputPath],
      BEATS_FFMPEG_TIMEOUT_MS
    )
    const pcm = await readFile(outputPath)
    // Read in place when the bytes start on a four-byte line, which a file
    // this size always does, and copied out otherwise, because a Float32Array
    // laid over them would refuse. An hour of music is 160 MB of samples, so
    // a second copy is worth avoiding on a server short of memory.
    const length = Math.floor(pcm.byteLength / 4)
    const samples =
      pcm.byteOffset % 4 === 0
        ? new Float32Array(pcm.buffer, pcm.byteOffset, length)
        : new Float32Array(pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + length * 4))
    found = findBeats(samples)
  }

  await db.execute(sql`
    update video_media_beats set
      status = 'ready',
      beats = ${JSON.stringify(found.beats)}::jsonb,
      tempo = ${found.tempo},
      error = null,
      lease_token = null,
      lease_expires_at = null,
      generated_at = now(),
      updated_at = now()
    where media_id = ${job.mediaId}
      and lease_token = ${job.leaseToken}
      and status = 'generating'
  `)
}

async function hasSoundTrack(inputPath: string) {
  const output = await runCommand(
    "ffprobe",
    ["-v", "error", "-select_streams", "a:0", "-show_entries", "stream=index", "-of", "json", inputPath],
    FFPROBE_TIMEOUT_MS
  )
  return Boolean((JSON.parse(output) as { streams?: unknown[] }).streams?.length)
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
