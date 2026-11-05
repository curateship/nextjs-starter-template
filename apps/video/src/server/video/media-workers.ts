import { spawn } from "node:child_process"
import { mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { sql } from "drizzle-orm"

import { now, uuid } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import { publishNotificationCreated } from "@/server/notifications/events"
import { customShellNotifications } from "@/server/schema"
import {
  deleteFromR2,
  uploadFileToR2,
  uploadToR2,
} from "@/server/media/storage"
import { DISK_WAIT_MS, isDiskFullError } from "@/server/video/disk-space"
import { fileCache, type CachedFile } from "@/server/video/file-cache"
import { BIG_FILE_BYTES } from "@/server/video/sound-source"
import { resolveProxyConcurrency } from "@/server/video/media-worker-config"
import { projectThumbnailTick } from "@/server/video/project-thumbnails"
import { BEAT_SAMPLE_RATE, findBeats } from "@/lib/video/beats"
import { loudnormMeasureFilter, parseLoudnormMeasurement } from "@/lib/video/audio-loudness"
import { videoMediaLoudness } from "@/server/video/schema"
import { filmstripPlan, filmstripSheetPath } from "@/lib/video/filmstrip-sheets"
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
// Unchanged when strips gained sheets (drizzle/0148): the frames themselves
// are drawn the same way, and a strip made before still reads as one sheet.
export const MEDIA_FILMSTRIP_PROFILE = "jpeg-160h-v1"
const MEDIA_WAVEFORM_PROFILE = "u8-peaks-25ps-v1"

const MAX_ATTEMPTS = 3
const LEASE_SECONDS = 120
const HEARTBEAT_MS = 30_000
const FFPROBE_TIMEOUT_MS = 60 * 1000

/**
 * The least time a smooth copy may take, which was the whole allowance until
 * 3 Nov 2026. A longer video gets twice its own length on top of nothing
 * (`proxyTimeoutMs`), so an hour of 4K is not cut off at thirty minutes.
 */
const PROXY_MIN_TIMEOUT_MS = 30 * 60 * 1000

// Over BIG_FILE_BYTES (sound-source.ts), a video's frames, sound shape,
// cleaned sound and beats are made from its smooth copy only, so a 20GB
// original is downloaded once, for the smooth copy, and never for them. A
// smaller file is quick enough to read either way and keeps today's order.

/** How often the kept copies of deleted files are swept out. */
const CACHE_SWEEP_MS = 10 * 60 * 1000
const FILMSTRIP_FFMPEG_TIMEOUT_MS = 15 * 60 * 1000


// Low enough to keep a long file's decoded sound to a few megabytes a minute,
// still far more samples than the 25 points a second the timeline draws.
const WAVEFORM_SAMPLE_RATE = 8000
const WAVEFORM_FFMPEG_TIMEOUT_MS = 15 * 60 * 1000

type JobKind = "proxy" | "filmstrip" | "waveform" | "clean" | "beats" | "steady"

const JOB_KINDS: JobKind[] = ["proxy", "filmstrip", "waveform", "clean", "beats", "steady"]

const JOB_TABLES = {
  proxy: "video_media_proxies",
  filmstrip: "video_media_filmstrips",
  waveform: "video_media_waveforms",
  clean: "video_media_clean_sounds",
  beats: "video_media_beats",
  steady: "video_media_steady_copies",
} as const satisfies Record<JobKind, string>

// The column a row is claimed by. Every queue has one row per file except
// cleaned sound, which has one per file and strength, keyed by both joined.
const JOB_KEYS: Record<JobKind, "media_id" | "id"> = {
  proxy: "media_id",
  filmstrip: "media_id",
  waveform: "media_id",
  clean: "id",
  beats: "media_id",
  steady: "media_id",
}

const JOB_LABELS: Record<JobKind, string> = {
  proxy: "Proxy",
  filmstrip: "Filmstrip",
  waveform: "Waveform",
  clean: "Cleaned sound",
  beats: "Beats",
  steady: "Steady copy",
}

const CLEAN_FFMPEG_TIMEOUT_MS = 15 * 60 * 1000
const BEATS_FFMPEG_TIMEOUT_MS = 15 * 60 * 1000

type WorkerState = {
  active: number
  pumping: boolean
  nextKind: JobKind
  /** Nothing new is claimed before this, after a job found the disk too full. */
  diskWaitUntil: number
  lastCacheSweep: number
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
      diskWaitUntil: 0,
      lastCacheSweep: 0,
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
  await sweepFileCache().catch((error) => {
    console.error("Video file cache sweep failed", error)
  })
  // The projects list's pictures ride this tick too. Each of its steps
  // catches its own failure.
  await projectThumbnailTick()
}

/**
 * Deletes the kept copies of files that are no longer in the library, and of
 * smooth copies that were replaced, every ten minutes. The library's delete
 * is the shell's, so the sweep is how a deleted file leaves this server's
 * disk without the shell knowing the folder exists.
 */
async function sweepFileCache() {
  const state = workerState()
  if (Date.now() - state.lastCacheSweep < CACHE_SWEEP_MS) return
  state.lastCacheSweep = Date.now()
  // Every library file: exports and saved frames keep pictures and sound
  // files here too, not only videos.
  const live = await db.execute(sql`
    select storage_path from media
    union all
    select storage_path from video_media_proxies where storage_path is not null
  `)
  await fileCache().sweep(
    (live.rows as { storage_path: string }[]).map((row) => row.storage_path)
  )
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
  if (Date.now() < state.diskWaitUntil) return
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
  fileSize: number
  fileType: string
  originalName: string
  attempts: number
  leaseToken: string
}

/**
 * Jobs that read a video's smooth copy wait for it when the original is big,
 * so they never download a 20GB file of their own. A smooth copy that failed
 * lets them go on, and they then say so themselves (`smoothCopySource`).
 */
const WAITS_FOR_SMOOTH_COPY: Record<JobKind, boolean> = {
  proxy: false,
  filmstrip: true,
  waveform: true,
  clean: true,
  beats: true,
  // A steady copy is drawn from the original, at the quality an export needs.
  // The file cache keeps a big original on disk the way the smooth copy does.
  steady: false,
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
  // Inside the pick, not after it: a big file still waiting for its smooth
  // copy must be passed over, not hold up every file queued behind it.
  const ready = WAITS_FOR_SMOOTH_COPY[kind]
    ? sql`and (qm.file_type <> 'video' or qm.file_size <= ${BIG_FILE_BYTES} or exists (
        select 1 from video_media_proxies qp
        where qp.media_id = q.media_id and qp.status in ('ready', 'error')
      ))`
    : sql``
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
        select q.${key} from ${sql.raw(table)} q
        join media qm on qm.id = q.media_id
        where q.status = 'queued' ${ready}
        order by q.created_at, q.${key}
        limit 1
        for update of q skip locked
      )
    returning t.${key} as job_key, t.media_id, t.attempts, m.user_id, m.storage_path,
      m.file_size, m.file_type, m.original_name
  `)
  const row = result.rows[0] as
    | {
        job_key: string
        media_id: string
        attempts: number
        user_id: string
        storage_path: string
        file_size: string | number
        file_type: string
        original_name: string
      }
    | undefined
  if (!row) return null
  return {
    kind,
    key: row.job_key,
    mediaId: row.media_id,
    userId: row.user_id,
    storagePath: row.storage_path,
    fileSize: Number(row.file_size),
    fileType: row.file_type,
    originalName: row.original_name,
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
    } else if (job.kind === "steady") {
      await buildSteadyCopy(job, workDir)
    } else {
      await buildWaveform(job, workDir)
    }
  } catch (error) {
    if (isDiskFullError(error)) {
      await waitForDisk(table, job, error.message)
    } else {
      await recordFailure(table, job, error)
    }
  } finally {
    clearInterval(heartbeat)
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined)
  }
}

/**
 * Puts a job that found the disk too full back in its queue, without using up
 * one of its tries, and stops the queue claiming anything for a minute. The
 * reason stays on the row while it waits, so the Media panel can say it.
 */
async function waitForDisk(table: string, job: ClaimedJob, message: string) {
  console.warn(`${JOB_LABELS[job.kind]} for ${job.mediaId}: ${message}`)
  workerState().diskWaitUntil = Date.now() + DISK_WAIT_MS
  await db
    .execute(
      sql`
        update ${sql.raw(table)} set
          status = 'queued',
          attempts = greatest(attempts - 1, 0),
          error = ${message},
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

async function recordFailure(table: string, job: ClaimedJob, error: unknown) {
  const known =
    error instanceof Error &&
    (error.message === "ffmpeg is not installed" ||
      error.message === "ffprobe is not installed" ||
      error.message === NO_SOUND_TO_CLEAN_MESSAGE ||
    error.message === NO_SMOOTH_COPY_MESSAGE)
  const message = known
    ? (error as Error).message
    : `${JOB_LABELS[job.kind]} generation failed`
  // A file with no sound will have none on the next try either.
  const retry =
    job.attempts < MAX_ATTEMPTS &&
    !(error instanceof Error && error.message === NO_SOUND_TO_CLEAN_MESSAGE)
  const ended = await db
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
        returning status
      `
    )
    .catch(() => null)
  if (job.kind === "proxy" && !retry && ended?.rows.length) {
    await noticeSmoothCopy(job, "failed")
  }
}

/**
 * Tells the owner, wherever they are in the app, that a video can be edited
 * now, or that it could not be got ready. Sent once the smooth copy is made,
 * or once its last try fails.
 */
async function noticeSmoothCopy(job: ClaimedJob, outcome: "ready" | "failed") {
  try {
    await db.insert(customShellNotifications).values({
      id: uuid(),
      recipientUserId: job.userId,
      type: "app_activity",
      message:
        outcome === "ready"
          ? `${job.originalName} is ready to edit`
          : `${job.originalName} could not be got ready to edit`,
      detail:
        outcome === "ready"
          ? "Its smooth copy is made, so it scrubs without waiting in the editor."
          : "Its smooth copy failed three times. Try again from the file in the editor's Media panel.",
      createdAt: now(),
    })
    await publishNotificationCreated(job.userId)
  } catch (error) {
    // A notice is a nicety; the copy itself is made either way.
    console.error("Smooth copy notice failed", job.mediaId, error)
  }
}

/**
 * The time a smooth copy may take: twice the video's own length, and never
 * less than thirty minutes.
 */
export function proxyTimeoutMs(durationSeconds: number) {
  return Math.max(PROXY_MIN_TIMEOUT_MS, Math.round(durationSeconds * 2 * 1000))
}

async function buildProxy(job: ClaimedJob, workDir: string) {
  // The original stays on this server's disk afterwards, so the frames, an
  // export or a still frame that needs it later reads it from there.
  const source = await fileCache().open(job.storagePath, job.fileSize)
  try {
    const durationSeconds = await probeDurationSeconds(source.path).catch(() => 0)
    const outputPath = join(workDir, "proxy.mp4")
    // 720p cap that never upscales, a keyframe every second so the editor can
    // scrub, and subtitles/data streams stripped.
    await runCommand(
      "ffmpeg",
      [
        "-y",
        "-i",
        source.path,
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
      proxyTimeoutMs(durationSeconds)
    )

    // The `video/` prefix keeps these keys outside the shell's orphan scanner,
    // which only considers `{userId}/...` upload keys as its own.
    const storagePath = `video/proxies/${job.userId}/${job.mediaId}/${job.leaseToken}.mp4`
    // From disk in pieces: the copy of a long 4K video can pass 2GB.
    const fileSize = (await stat(outputPath)).size
    await uploadFileToR2(storagePath, outputPath, "video/mp4")

    const finished = await db.execute(sql`
      update video_media_proxies set
        status = 'ready',
        storage_path = ${storagePath},
        file_size = ${fileSize},
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
      return
    }
    // The frames and sound jobs read this copy next.
    await fileCache().adopt(storagePath, outputPath, fileSize)
    await noticeSmoothCopy(job, "ready")
  } finally {
    await source.release()
  }
}

/**
 * Whether this server's ffmpeg has the two-pass steadying filters. Homebrew's
 * and some Alpine builds leave libvidstab out, and `deshake` is then used
 * instead (steady-shaky-footage.md). Asked once per process.
 */
let vidstabAnswer: Promise<boolean> | null = null
function hasVidstab() {
  vidstabAnswer ??= runCommand("ffmpeg", ["-hide_banner", "-filters"], 30_000)
    .then((filters) => /\bvidstabdetect\b/.test(filters))
    .catch(() => false)
  return vidstabAnswer
}

/**
 * A steadied copy of one video (steady-shaky-footage.md), at most 1080 pixels
 * on its shorter side, which is as big as an export draws, with a keyframe
 * every second so the editor can scrub it. With libvidstab it is two passes:
 * the first finds how the camera shook, the second takes that out and grows
 * the picture just enough to hide the moving edges. Without it, `deshake`
 * does both in one pass.
 */
async function buildSteadyCopy(job: ClaimedJob, workDir: string) {
  const source = await fileCache().open(job.storagePath, job.fileSize)
  try {
    const durationSeconds = await probeDurationSeconds(source.path).catch(() => 0)
    const timeoutMs = proxyTimeoutMs(durationSeconds) * 2
    const transforms = join(workDir, "transforms.trf")
    const vidstab = await hasVidstab()
    if (vidstab) {
      await runCommand(
        "ffmpeg",
        ["-y", "-i", source.path, "-map", "0:v:0", "-vf", `vidstabdetect=shakiness=6:accuracy=12:result=${transforms}`, "-f", "null", "-"],
        timeoutMs
      )
    }
    const steady = vidstab
      ? `vidstabtransform=input=${transforms}:smoothing=15:optzoom=1,unsharp=5:5:0.8:3:3:0.4`
      : "deshake"
    const outputPath = join(workDir, "steady.mp4")
    await runCommand(
      "ffmpeg",
      [
        "-y",
        "-i",
        source.path,
        "-map",
        "0:v:0",
        "-map",
        "0:a?",
        "-vf",
        `${steady},scale=w=if(gte(iw\\,ih)\\,-2\\,min(iw\\,1080)):h=if(gte(iw\\,ih)\\,min(ih\\,1080)\\,-2)`,
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "20",
        "-pix_fmt",
        "yuv420p",
        "-force_key_frames",
        "expr:gte(t,n_forced*1)",
        "-c:a",
        "aac",
        "-b:a",
        "160k",
        "-movflags",
        "+faststart",
        "-sn",
        "-dn",
        outputPath,
      ],
      timeoutMs
    )

    const storagePath = `video/steady/${job.userId}/${job.mediaId}/${job.leaseToken}.mp4`
    const fileSize = (await stat(outputPath)).size
    await uploadFileToR2(storagePath, outputPath, "video/mp4")
    const finished = await db.execute(sql`
      update video_media_steady_copies set
        status = 'ready',
        storage_path = ${storagePath},
        file_size = ${fileSize},
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
      return
    }
    // An export reads it next, so it stays on this server's disk.
    await fileCache().adopt(storagePath, outputPath, fileSize)
  } finally {
    await source.release()
  }
}

/** Why a job that waited for a big video's smooth copy cannot go on. */
export const NO_SMOOTH_COPY_MESSAGE =
  "This video is too big to read without its smooth copy, and the smooth copy could not be made. Try again from the Media panel."

/**
 * The file a video's frames and sound jobs read, on this server's disk: the
 * smooth copy once it is ready, otherwise the upload itself. A big video's
 * jobs only start once its smooth copy is ready or has failed
 * (`WAITS_FOR_SMOOTH_COPY`); after a failure they stop here rather than
 * download the 20GB original. A sound file has no smooth copy and is read
 * as it is.
 */
async function smoothCopySource(job: ClaimedJob): Promise<CachedFile> {
  const proxy = await db.execute(sql`
    select storage_path, file_size from video_media_proxies
    where media_id = ${job.mediaId} and status = 'ready' and storage_path is not null
  `)
  const row = proxy.rows[0] as
    | { storage_path: string; file_size: string | number | null }
    | undefined
  if (row) return fileCache().open(row.storage_path, Number(row.file_size ?? 0))
  if (job.fileType === "video" && job.fileSize > BIG_FILE_BYTES) {
    throw new Error(NO_SMOOTH_COPY_MESSAGE)
  }
  return fileCache().open(job.storagePath, job.fileSize)
}

async function buildFilmstrip(job: ClaimedJob, workDir: string) {
  // Prefer the 720p proxy as input — far faster to decode, and its frames are
  // already rotated the way ffmpeg will rotate them here.
  const source = await smoothCopySource(job)
  try {
    await drawFilmstrip(job, workDir, source.path)
  } finally {
    await source.release()
  }
}

async function drawFilmstrip(job: ClaimedJob, workDir: string, inputPath: string) {
  const durationSeconds = await probeDurationSeconds(inputPath)
  // A frame every two seconds up to four minutes, then one every five,
  // spread over sheets of up to 120 (filmstrip-sheets.ts).
  const plan = filmstripPlan(durationSeconds)
  const { frameCount, columns, rowsPerSheet } = plan

  const filter = `fps=${frameCount}/${durationSeconds},scale=320:160:force_original_aspect_ratio=decrease:force_divisible_by=2,tile=${columns}x${rowsPerSheet}:padding=0:margin=0`
  await runCommand(
    "ffmpeg",
    ["-y", "-i", inputPath, "-map", "0:v:0", "-vf", filter, "-c:v", "mjpeg", "-q:v", "6", "-start_number", "0", join(workDir, "sheet-%d.jpg")],
    filmstripTimeoutMs(durationSeconds)
  )
  // The frame rate can round to one frame more than planned, which would
  // start a sheet of one frame nobody looks at; those are left behind.
  const made = (await readdir(workDir)).filter((name) => /^sheet-\d+\.jpg$/.test(name)).length
  const sheetCount = Math.min(plan.sheetCount, made)
  if (!sheetCount) throw new Error("ffmpeg made no frames")

  // Measure the sprite rather than trusting a probe of the source: the sprite
  // is what ffmpeg actually produced, rotation and all. Guessing from the
  // source squished rotated phone clips in the app this ports from. Every
  // sheet is the same full grid, the last padded out.
  const sprite = await probeDimensions(join(workDir, "sheet-0.jpg"))
  const frameWidth = Math.max(2, Math.round(sprite.width / columns))
  const frameHeight = Math.max(2, Math.round(sprite.height / rowsPerSheet))
  const durationMs = Math.max(1, Math.round(durationSeconds * 1000))

  const storagePath = `video/filmstrips/${job.userId}/${job.mediaId}/${job.leaseToken}.jpg`
  const stored: string[] = []
  for (let sheet = 0; sheet < sheetCount; sheet += 1) {
    const sheetPath = filmstripSheetPath(storagePath, sheet)
    stored.push(sheetPath)
    await uploadToR2(sheetPath, await readFile(join(workDir, `sheet-${sheet}.jpg`)), "image/jpeg")
  }

  const finished = await db.execute(sql`
    update video_media_filmstrips set
      status = 'ready',
      storage_path = ${storagePath},
      frame_count = ${Math.min(frameCount, sheetCount * columns * rowsPerSheet)},
      frame_width = ${frameWidth},
      frame_height = ${frameHeight},
      columns = ${columns},
      rows_per_sheet = ${rowsPerSheet},
      sheet_count = ${sheetCount},
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
    for (const sheetPath of stored) await deleteFromR2(sheetPath).catch(() => undefined)
  }
}

/**
 * The time frames may take: fifteen minutes, or a quarter of the video's
 * length when that is longer. Reading an hour of smooth copy for 720 frames
 * takes a few minutes; the allowance is there for a busy server.
 */
function filmstripTimeoutMs(durationSeconds: number) {
  return Math.max(FILMSTRIP_FFMPEG_TIMEOUT_MS, Math.round(durationSeconds * 250))
}

async function buildWaveform(job: ClaimedJob, workDir: string) {
  // A video's proxy carries the same sound in a far smaller file. A sound file
  // has no proxy, so this falls through to the upload itself.
  const source = await smoothCopySource(job)
  try {
    await drawWaveform(job, workDir, source.path)
  } finally {
    await source.release()
  }
}

async function drawWaveform(job: ClaimedJob, workDir: string, inputPath: string) {
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

  // The file's loudness, measured once here while its sound is at hand, so a
  // clip dropped later arrives at the even loudness straight away
  // (even-out-clip-volume.md). A failure only means the drop measures it.
  if (durationMs !== null) {
    await measureLoudnessOnce(job.mediaId, inputPath).catch((error) =>
      console.error("Measuring a file's loudness failed", job.mediaId, error)
    )
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

async function measureLoudnessOnce(mediaId: string, inputPath: string) {
  const stderr = await runCommand(
    "ffmpeg",
    ["-i", inputPath, "-map", "0:a:0", "-vn", "-af", loudnormMeasureFilter(), "-f", "null", "-"],
    WAVEFORM_FFMPEG_TIMEOUT_MS,
    "stderr"
  )
  await db
    .insert(videoMediaLoudness)
    .values({ mediaId, lufs: parseLoudnormMeasurement(stderr)?.inputI ?? null, measuredAt: now() })
    .onConflictDoNothing()
}

export const NO_SOUND_TO_CLEAN_MESSAGE = "This file has no sound to clean"

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
  const source = await smoothCopySource(job)
  try {
    await cleanSound(job, workDir, source.path, strength)
  } finally {
    await source.release()
  }
}

async function cleanSound(
  job: ClaimedJob,
  workDir: string,
  inputPath: string,
  strength: Parameters<typeof voiceCleanFilter>[0]
) {
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
  const source = await smoothCopySource(job)
  try {
    await findFileBeats(job, workDir, source.path)
  } finally {
    await source.release()
  }
}

async function findFileBeats(job: ClaimedJob, workDir: string, inputPath: string) {
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
/**
 * Runs a command and resolves with what it printed. `stderr` gives the last
 * 4000 characters of its error stream instead, which is where ffmpeg prints a
 * measurement.
 */
function runCommand(
  command: string,
  args: string[],
  timeoutMs: number,
  output: "stdout" | "stderr" = "stdout"
) {
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
        resolve(output === "stderr" ? stderrTail : stdout)
      } else {
        reject(new Error(`${command} exited with ${code}: ${stderrTail}`))
      }
    })
  })
}
