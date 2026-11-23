import { spawn } from "node:child_process"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { and, eq, sql } from "drizzle-orm"

import { db } from "@/server/db"
import { resolveProxyConcurrency } from "@/server/media-proxy-config"
import {
  deleteFromR2,
  getFromR2,
  uploadFileToR2,
  writeBodyToFile,
} from "@/server/media-storage"
import { aiVideoMedia } from "@/server/schema"
import { now, uuid } from "@/server/security"

const PROXY_CONCURRENCY = resolveProxyConcurrency(
  process.env.AI_VIDEO_PROXY_CONCURRENCY
)
const MAX_ATTEMPTS = 3
const LEASE_SECONDS = 120
const HEARTBEAT_MS = 30_000
const TICK_MS = 15_000
const INTERRUPTED_MESSAGE = "Proxy generation was interrupted"
const WORKER_STATE_KEY = "__aiVideoProxyWorkerState"

type ClaimedProxy = {
  kind: "proxy"
  id: string
  user_id: string
  storage_path: string
  proxy_attempts: number
  proxy_lease_token: string
}

type ClaimedFilmstrip = {
  kind: "filmstrip"
  id: string
  user_id: string
  storage_path: string
  proxy_status: string | null
  proxy_storage_path: string | null
  filmstrip_attempts: number
  filmstrip_lease_token: string
}

type WorkerState = {
  registered: boolean
  pumping: boolean
  active: number
  nextKind: "proxy" | "filmstrip"
}

function workerState(): WorkerState {
  const globals = globalThis as Record<string, unknown>
  if (!globals[WORKER_STATE_KEY]) {
    globals[WORKER_STATE_KEY] = {
      registered: false,
      pumping: false,
      active: 0,
      nextKind: "filmstrip",
    } satisfies WorkerState
  }
  return globals[WORKER_STATE_KEY] as WorkerState
}

export function registerMediaProxyWorker() {
  const state = workerState()
  if (state.registered) return
  state.registered = true
  setInterval(() => void tick(), TICK_MS).unref()
  void tick()
}

export function kickMediaProxyWorker() {
  void pumpProxyQueue().catch((error) => {
    console.error("Media proxy queue pump failed", error)
  })
}

async function tick() {
  await reclaimStaleProxies().catch((error) => {
    console.error("Media proxy reclaim failed", error)
  })
  await reclaimStaleFilmstrips().catch((error) => {
    console.error("Media filmstrip reclaim failed", error)
  })
  await pumpProxyQueue().catch((error) => {
    console.error("Media proxy queue pump failed", error)
  })
}

async function pumpProxyQueue() {
  const state = workerState()
  if (state.pumping) return
  state.pumping = true
  try {
    while (state.active < PROXY_CONCURRENCY) {
      const job =
        state.nextKind === "filmstrip"
          ? ((await claimNextFilmstrip()) ?? (await claimNextProxy()))
          : ((await claimNextProxy()) ?? (await claimNextFilmstrip()))
      if (!job) return
      state.nextKind = job.kind === "filmstrip" ? "proxy" : "filmstrip"
      state.active += 1
      void (job.kind === "proxy" ? generateProxy(job) : generateFilmstrip(job))
        .catch((error) => {
          console.error(`Media ${job.kind} job crashed`, job.id, error)
        })
        .finally(() => {
          state.active -= 1
          kickMediaProxyWorker()
        })
    }
  } finally {
    state.pumping = false
  }
}

async function claimNextProxy(): Promise<ClaimedProxy | null> {
  const result = await db.execute(sql`
    update media set
      proxy_status = 'generating',
      proxy_attempts = proxy_attempts + 1,
      proxy_error = null,
      proxy_lease_token = ${uuid()},
      proxy_lease_expires_at = now() + make_interval(secs => ${LEASE_SECONDS}),
      proxy_started_at = coalesce(proxy_started_at, now()),
      updated_at = now()
    where id = (
      select id from media
      where file_type = 'video' and proxy_status = 'queued'
      order by created_at, id
      limit 1
      for update skip locked
    )
    returning id, user_id, storage_path, proxy_attempts, proxy_lease_token
  `)
  const row = result.rows[0] as Omit<ClaimedProxy, "kind"> | undefined
  return row ? { kind: "proxy", ...row } : null
}

async function claimNextFilmstrip(): Promise<ClaimedFilmstrip | null> {
  const result = await db.execute(sql`
    update media set
      filmstrip_status = 'generating',
      filmstrip_attempts = filmstrip_attempts + 1,
      filmstrip_error = null,
      filmstrip_lease_token = ${uuid()},
      filmstrip_lease_expires_at = now() + make_interval(secs => ${LEASE_SECONDS}),
      updated_at = now()
    where id = (
      select id from media
      where file_type = 'video' and filmstrip_status = 'queued'
      order by created_at, id
      limit 1
      for update skip locked
    )
    returning id, user_id, storage_path, proxy_status, proxy_storage_path, filmstrip_attempts, filmstrip_lease_token
  `)
  const row = result.rows[0] as Omit<ClaimedFilmstrip, "kind"> | undefined
  return row ? { kind: "filmstrip", ...row } : null
}

async function generateProxy(proxy: ClaimedProxy) {
  const dir = await mkdtemp(path.join(tmpdir(), "media-proxy-"))
  const heartbeat = setInterval(() => {
    void db
      .execute(
        sql`
        update media set
          proxy_lease_expires_at = now() + make_interval(secs => ${LEASE_SECONDS}),
          updated_at = now()
        where id = ${proxy.id}
          and proxy_lease_token = ${proxy.proxy_lease_token}
          and proxy_status = 'generating'
      `
      )
      .catch((error) => {
        console.error("Media proxy heartbeat failed", proxy.id, error)
      })
  }, HEARTBEAT_MS)
  heartbeat.unref()

  const proxyStoragePath = `proxies/${proxy.user_id}/${proxy.id}/${proxy.proxy_lease_token}.mp4`
  try {
    const source = await getFromR2(proxy.storage_path)
    const input = path.join(
      dir,
      `source${path.extname(proxy.storage_path) || ".bin"}`
    )
    const output = path.join(dir, "proxy.mp4")
    await writeBodyToFile(source.Body, input)
    await runFfmpeg(input, output)
    const proxyFileSize = await uploadFileToR2(
      proxyStoragePath,
      output,
      "video/mp4"
    )

    const updated = await db
      .update(aiVideoMedia)
      .set({
        proxyStatus: "ready",
        proxyStoragePath,
        proxyFileSize,
        proxyError: null,
        proxyLeaseToken: null,
        proxyLeaseExpiresAt: null,
        proxyGeneratedAt: now(),
        updatedAt: now(),
      })
      .where(
        and(
          eq(aiVideoMedia.id, proxy.id),
          eq(aiVideoMedia.proxyLeaseToken, proxy.proxy_lease_token),
          eq(aiVideoMedia.proxyStatus, "generating")
        )
      )
      .returning({ id: aiVideoMedia.id })

    if (!updated.length) {
      await deleteFromR2(proxyStoragePath).catch(() => undefined)
    }
  } catch (error) {
    const message =
      error instanceof Error && error.message === "ffmpeg is not installed"
        ? error.message
        : "Proxy generation failed"
    const retry = proxy.proxy_attempts < MAX_ATTEMPTS
    await db
      .update(aiVideoMedia)
      .set({
        proxyStatus: retry ? "queued" : "error",
        proxyError: message,
        proxyLeaseToken: null,
        proxyLeaseExpiresAt: null,
        updatedAt: now(),
      })
      .where(
        and(
          eq(aiVideoMedia.id, proxy.id),
          eq(aiVideoMedia.proxyLeaseToken, proxy.proxy_lease_token),
          eq(aiVideoMedia.proxyStatus, "generating")
        )
      )
  } finally {
    clearInterval(heartbeat)
    await rm(dir, { recursive: true, force: true })
  }
}

async function reclaimStaleProxies() {
  await db.execute(sql`
    update media set
      proxy_status = case when proxy_attempts < ${MAX_ATTEMPTS} then 'queued' else 'error' end,
      proxy_error = case when proxy_attempts < ${MAX_ATTEMPTS} then proxy_error else ${INTERRUPTED_MESSAGE} end,
      proxy_lease_token = null,
      proxy_lease_expires_at = null,
      updated_at = now()
    where proxy_status = 'generating' and proxy_lease_expires_at < now()
  `)
}

async function generateFilmstrip(filmstrip: ClaimedFilmstrip) {
  const dir = await mkdtemp(path.join(tmpdir(), "media-filmstrip-"))
  const heartbeat = setInterval(() => {
    void db
      .execute(
        sql`
        update media set
          filmstrip_lease_expires_at = now() + make_interval(secs => ${LEASE_SECONDS}),
          updated_at = now()
        where id = ${filmstrip.id}
          and filmstrip_lease_token = ${filmstrip.filmstrip_lease_token}
          and filmstrip_status = 'generating'
      `
      )
      .catch((error) => {
        console.error("Media filmstrip heartbeat failed", filmstrip.id, error)
      })
  }, HEARTBEAT_MS)
  heartbeat.unref()

  const filmstripStoragePath = `filmstrips/${filmstrip.user_id}/${filmstrip.id}/${filmstrip.filmstrip_lease_token}.jpg`
  // Build the sprite from the small, already-rotated 720p proxy when it exists
  // (measured ~30× faster to decode than the full-res original, and a far
  // smaller download); fall back to the original before the proxy is ready.
  const sourcePath =
    filmstrip.proxy_status === "ready" && filmstrip.proxy_storage_path
      ? filmstrip.proxy_storage_path
      : filmstrip.storage_path
  let uploaded = false
  try {
    const source = await getFromR2(sourcePath)
    const input = path.join(
      dir,
      `source${path.extname(sourcePath) || ".bin"}`
    )
    const output = path.join(dir, "filmstrip.jpg")
    await writeBodyToFile(source.Body, input)
    const metadata = await createFilmstrip(input, output)
    await uploadFileToR2(filmstripStoragePath, output, "image/jpeg")
    uploaded = true

    const updated = await db
      .update(aiVideoMedia)
      .set({
        filmstripStatus: "ready",
        filmstripStoragePath,
        filmstripFrameCount: metadata.frameCount,
        filmstripFrameWidth: metadata.frameWidth,
        filmstripFrameHeight: metadata.frameHeight,
        filmstripColumns: metadata.columns,
        filmstripDurationMs: metadata.durationMs,
        filmstripError: null,
        filmstripLeaseToken: null,
        filmstripLeaseExpiresAt: null,
        filmstripGeneratedAt: now(),
        updatedAt: now(),
      })
      .where(
        and(
          eq(aiVideoMedia.id, filmstrip.id),
          eq(
            aiVideoMedia.filmstripLeaseToken,
            filmstrip.filmstrip_lease_token
          ),
          eq(aiVideoMedia.filmstripStatus, "generating")
        )
      )
      .returning({ id: aiVideoMedia.id })

    if (!updated.length) {
      await deleteFromR2(filmstripStoragePath).catch(() => undefined)
    }
  } catch (error) {
    if (uploaded) {
      await deleteFromR2(filmstripStoragePath).catch(() => undefined)
    }
    const message =
      error instanceof Error &&
      (error.message === "ffmpeg is not installed" ||
        error.message === "ffprobe is not installed")
        ? error.message
        : "Filmstrip generation failed"
    const retry = filmstrip.filmstrip_attempts < MAX_ATTEMPTS
    await db
      .update(aiVideoMedia)
      .set({
        filmstripStatus: retry ? "queued" : "error",
        filmstripError: message,
        filmstripLeaseToken: null,
        filmstripLeaseExpiresAt: null,
        updatedAt: now(),
      })
      .where(
        and(
          eq(aiVideoMedia.id, filmstrip.id),
          eq(
            aiVideoMedia.filmstripLeaseToken,
            filmstrip.filmstrip_lease_token
          ),
          eq(aiVideoMedia.filmstripStatus, "generating")
        )
      )
  } finally {
    clearInterval(heartbeat)
    await rm(dir, { recursive: true, force: true })
  }
}

async function reclaimStaleFilmstrips() {
  await db.execute(sql`
    update media set
      filmstrip_status = case when filmstrip_attempts < ${MAX_ATTEMPTS} then 'queued' else 'error' end,
      filmstrip_error = case when filmstrip_attempts < ${MAX_ATTEMPTS} then filmstrip_error else 'Filmstrip generation was interrupted' end,
      filmstrip_lease_token = null,
      filmstrip_lease_expires_at = null,
      updated_at = now()
    where filmstrip_status = 'generating' and filmstrip_lease_expires_at < now()
  `)
}

// Each frame is fitted inside this box preserving the clip's true, already
// auto-rotated aspect (ffmpeg rotates on decode). Deriving the cell from what
// ffmpeg actually decodes — instead of forcing `scale=W:H` from a separate
// ffprobe — is what stops a rotated phone clip from being squished into a
// mismatched cell when the probe reads rotation differently than the decoder.
// `force_divisible_by` keeps both axes even for the mjpeg (yuvj420p) encoder.
const FILMSTRIP_FRAME_MAX_WIDTH = 320
const FILMSTRIP_FRAME_MAX_HEIGHT = 160

async function createFilmstrip(input: string, output: string) {
  const durationSeconds = await probeVideoDuration(input)
  const frameCount = Math.min(120, Math.max(1, Math.round(durationSeconds / 2)))
  const columns = Math.min(10, frameCount)
  const rows = Math.ceil(frameCount / columns)
  await runFilmstripFfmpeg(input, output, {
    frameCount,
    columns,
    rows,
    durationSeconds,
  })
  // The sprite is a columns×rows grid of identical cells, so the aspect-correct
  // cell size is just the tiled image divided by the grid.
  const sprite = await probeImageSize(output)
  const frameWidth = Math.max(2, Math.round(sprite.width / columns))
  const frameHeight = Math.max(2, Math.round(sprite.height / rows))
  return {
    frameCount,
    frameWidth,
    frameHeight,
    columns,
    durationMs: Math.max(1, Math.round(durationSeconds * 1000)),
  }
}

function ffprobeJson(input: string, entries: string) {
  return new Promise<string>((resolve, reject) => {
    let stdout = ""
    const child = spawn(
      "ffprobe",
      [
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        entries,
        "-of",
        "json",
        input,
      ],
      { stdio: ["ignore", "pipe", "ignore"], timeout: 60_000 }
    )
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString()
    })
    child.on("error", (error: NodeJS.ErrnoException) => {
      reject(
        new Error(
          error.code === "ENOENT"
            ? "ffprobe is not installed"
            : "Filmstrip probe failed"
        )
      )
    })
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error("Filmstrip probe failed"))
        return
      }
      resolve(stdout)
    })
  })
}

// Only the duration is read from the source: the frame geometry is measured
// from the generated sprite instead, so it always matches ffmpeg's own
// (auto-rotated) decode rather than a probe that may disagree about rotation.
async function probeVideoDuration(input: string) {
  try {
    const result = JSON.parse(await ffprobeJson(input, "format=duration")) as {
      format?: { duration?: unknown }
    }
    const durationSeconds = Number(result.format?.duration)
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
      throw new Error("Invalid video metadata")
    }
    return durationSeconds
  } catch (error) {
    throw error instanceof Error && error.message === "ffprobe is not installed"
      ? error
      : new Error("Filmstrip probe failed")
  }
}

async function probeImageSize(input: string) {
  try {
    const result = JSON.parse(await ffprobeJson(input, "stream=width,height")) as {
      streams?: { width?: unknown; height?: unknown }[]
    }
    const stream = result.streams?.[0]
    const width = Number(stream?.width)
    const height = Number(stream?.height)
    if (
      !Number.isFinite(width) ||
      width <= 0 ||
      !Number.isFinite(height) ||
      height <= 0
    ) {
      throw new Error("Invalid filmstrip metadata")
    }
    return { width, height }
  } catch (error) {
    throw error instanceof Error && error.message === "ffprobe is not installed"
      ? error
      : new Error("Filmstrip probe failed")
  }
}

function runFilmstripFfmpeg(
  input: string,
  output: string,
  options: {
    frameCount: number
    columns: number
    rows: number
    durationSeconds: number
  }
) {
  return new Promise<void>((resolve, reject) => {
    let stderr = ""
    const filter = [
      `fps=${options.frameCount}/${options.durationSeconds}`,
      `scale=${FILMSTRIP_FRAME_MAX_WIDTH}:${FILMSTRIP_FRAME_MAX_HEIGHT}:force_original_aspect_ratio=decrease:force_divisible_by=2`,
      `tile=${options.columns}x${options.rows}:nb_frames=${options.frameCount}:padding=0:margin=0`,
    ].join(",")
    const child = spawn(
      "ffmpeg",
      [
        "-y",
        "-i",
        input,
        "-map",
        "0:v:0",
        "-vf",
        filter,
        "-frames:v",
        "1",
        "-c:v",
        "mjpeg",
        "-q:v",
        "6",
        output,
      ],
      { stdio: ["ignore", "ignore", "pipe"], timeout: 15 * 60_000 }
    )
    child.stderr.on("data", (chunk) => {
      stderr = (stderr + chunk.toString()).slice(-4_000)
    })
    child.on("error", (error) => {
      reject(
        new Error(
          error.code === "ENOENT"
            ? "ffmpeg is not installed"
            : "Filmstrip generation failed"
        )
      )
    })
    child.on("close", (code) => {
      if (code === 0) resolve()
      else {
        console.error("Media filmstrip ffmpeg stderr tail:", stderr)
        reject(new Error("Filmstrip generation failed"))
      }
    })
  })
}

function runFfmpeg(input: string, output: string) {
  return new Promise<void>((resolve, reject) => {
    let stderr = ""
    const child = spawn(
      "ffmpeg",
      [
        "-y",
        "-i",
        input,
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
        output,
      ],
      { stdio: ["ignore", "ignore", "pipe"], timeout: 30 * 60_000 }
    )

    child.stderr.on("data", (chunk) => {
      stderr = (stderr + chunk.toString()).slice(-4_000)
    })
    child.on("error", (error) => {
      reject(
        new Error(
          error.code === "ENOENT"
            ? "ffmpeg is not installed"
            : "Proxy generation failed"
        )
      )
    })
    child.on("close", (code) => {
      if (code === 0) resolve()
      else {
        console.error("Media proxy ffmpeg stderr tail:", stderr)
        reject(new Error("Proxy generation failed"))
      }
    })
  })
}
