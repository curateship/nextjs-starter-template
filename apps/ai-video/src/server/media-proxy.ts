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
  id: string
  user_id: string
  storage_path: string
  proxy_attempts: number
  proxy_lease_token: string
}

type WorkerState = { registered: boolean; pumping: boolean; active: number }

function workerState(): WorkerState {
  const globals = globalThis as Record<string, unknown>
  if (!globals[WORKER_STATE_KEY]) {
    globals[WORKER_STATE_KEY] = {
      registered: false,
      pumping: false,
      active: 0,
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
      const proxy = await claimNextProxy()
      if (!proxy) return
      state.active += 1
      void generateProxy(proxy)
        .catch((error) => {
          console.error("Media proxy job crashed", proxy.id, error)
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
  return (result.rows[0] as ClaimedProxy | undefined) ?? null
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
