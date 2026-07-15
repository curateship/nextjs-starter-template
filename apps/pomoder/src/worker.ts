import { execFile } from "node:child_process"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { promisify } from "node:util"

import { and, eq } from "drizzle-orm"

import { db } from "@/server/db"
import { settleGenerationCredit } from "@/server/generation"
import {
  finalizeProcessedUpload,
  getMediaObject,
  putMediaObject,
} from "@/server/pomoder-media"
import { generateBackground, generateSoundscape } from "@/server/providers"
import {
  GENERATE_MEDIA_QUEUE,
  getBoss,
  PROCESS_MEDIA_QUEUE,
  ROOM_TRANSITION_QUEUE,
} from "@/server/queue"
import { notifyRoom } from "@/server/rooms"
import { mediaAssets, rooms, workerHeartbeats } from "@/server/schema"
import { logger, startServerMonitoring } from "@/server/observability"
import { processStorageDeletionJobs } from "@/server/storage-deletion"

const run = promisify(execFile)
startServerMonitoring()
const boss = await getBoss()
const workerId = `${process.env.HOSTNAME || "local"}:${process.pid}`

await boss.work<GenerationJob>(
  GENERATE_MEDIA_QUEUE,
  { includeMetadata: true, batchSize: 1 },
  async (jobs) => {
    for (const job of jobs) {
      try {
        await processGeneration(job.data, job.signal)
      } catch (error) {
        if (job.retryCount >= job.retryLimit) {
          await db
            .update(mediaAssets)
            .set({
              status: "failed",
              errorCode: safeErrorCode(error),
              updatedAt: new Date(),
            })
            .where(eq(mediaAssets.id, job.data.assetId))
          await settleGenerationCredit(
            job.data.userId,
            job.data.kind,
            false,
            job.data.month
          )
        }
        throw error
      }
    }
  }
)

await boss.work<{ assetId: string }>(
  PROCESS_MEDIA_QUEUE,
  { batchSize: 1 },
  async (jobs) => {
    for (const job of jobs) await processUpload(job.data.assetId)
  }
)

await boss.work<{ roomId: string; sequence: number }>(
  ROOM_TRANSITION_QUEUE,
  { batchSize: 1 },
  async (jobs) => {
    for (const job of jobs) {
      const [room] = await db
        .select()
        .from(rooms)
        .where(
          and(
            eq(rooms.id, job.data.roomId),
            eq(rooms.sequence, job.data.sequence)
          )
        )
        .limit(1)
      if (!room || !room.phaseEndsAt || room.phaseEndsAt > new Date()) continue
      const nextPhase = room.phase === "focus" ? "short" : "focus"
      const minutes =
        nextPhase === "focus" ? room.focusMinutes : room.shortBreakMinutes
      await db
        .update(rooms)
        .set({
          phase: nextPhase,
          sequence: room.sequence + 1,
          phaseStartedAt: new Date(),
          phaseEndsAt: new Date(Date.now() + minutes * 60_000),
          updatedAt: new Date(),
        })
        .where(eq(rooms.id, room.id))
      await notifyRoom(room.id, "phase")
    }
  }
)

setInterval(() => {
  void db
    .insert(workerHeartbeats)
    .values({ workerId, metadata: { pid: process.pid } })
    .onConflictDoUpdate({
      target: workerHeartbeats.workerId,
      set: { lastSeenAt: new Date(), metadata: { pid: process.pid } },
    })
}, 15_000)
let deletingStorage = false
async function deleteQueuedStorage() {
  if (deletingStorage) return
  deletingStorage = true
  try {
    await processStorageDeletionJobs()
  } finally {
    deletingStorage = false
  }
}
void deleteQueuedStorage().catch((error) =>
  logger.error(
    { event: "storage_delete_queue_failed", error },
    "Storage deletion queue failed"
  )
)
setInterval(() => {
  void deleteQueuedStorage().catch((error) =>
    logger.error(
      { event: "storage_delete_queue_failed", error },
      "Storage deletion queue failed"
    )
  )
}, 30_000)
logger.info({ event: "worker_started", workerId }, "Pomoder worker started")

async function processGeneration(job: GenerationJob, signal: AbortSignal) {
  await db
    .update(mediaAssets)
    .set({ status: "processing", updatedAt: new Date() })
    .where(eq(mediaAssets.id, job.assetId))
  const raw =
    job.kind === "background"
      ? await generateBackground(job.prompt, signal)
      : await generateSoundscape(job.prompt, signal)
  const processed = await processBytes(
    raw,
    job.kind === "background" ? "video" : "audio"
  )
  const key = `users/${job.userId}/${job.assetId}/${job.kind === "background" ? "background.mp4" : "soundscape.mp3"}`
  await putMediaObject(key, processed.body, processed.mimeType)
  await db
    .update(mediaAssets)
    .set({
      status: "ready",
      storageKey: key,
      mimeType: processed.mimeType,
      fileSize: processed.body.byteLength,
      updatedAt: new Date(),
    })
    .where(eq(mediaAssets.id, job.assetId))
  await settleGenerationCredit(job.userId, job.kind, true, job.month)
}

async function processUpload(assetId: string) {
  const [asset] = await db
    .select()
    .from(mediaAssets)
    .where(eq(mediaAssets.id, assetId))
    .limit(1)
  if (!asset || !["audio", "video"].includes(asset.kind)) return
  await db
    .update(mediaAssets)
    .set({ status: "processing", updatedAt: new Date() })
    .where(eq(mediaAssets.id, assetId))
  const object = await getMediaObject(asset.storageKey, null)
  if (!object.Body) throw new Error("MEDIA_NOT_FOUND")
  const raw = new Uint8Array(await object.Body.transformToByteArray())
  const processed = await processBytes(raw, asset.kind as "audio" | "video")
  const key = `users/${asset.ownerUserId}/${asset.id}/processed.${asset.kind === "video" ? "mp4" : "mp3"}`
  await putMediaObject(key, processed.body, processed.mimeType)
  await finalizeProcessedUpload(
    asset,
    key,
    processed.mimeType,
    processed.body.byteLength
  )
}

async function processBytes(bytes: Uint8Array, kind: "audio" | "video") {
  const folder = await mkdtemp(path.join(tmpdir(), "pomoder-"))
  const input = path.join(
    folder,
    kind === "video" ? "input.mp4" : "input.audio"
  )
  const output = path.join(
    folder,
    kind === "video" ? "output.mp4" : "output.mp3"
  )
  try {
    await writeFile(input, bytes)
    const args =
      kind === "video"
        ? [
            "-y",
            "-i",
            input,
            "-an",
            "-vf",
            "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-movflags",
            "+faststart",
            output,
          ]
        : [
            "-y",
            "-i",
            input,
            "-af",
            "loudnorm",
            "-codec:a",
            "libmp3lame",
            "-b:a",
            "192k",
            output,
          ]
    await run("ffmpeg", args, { timeout: 240_000, maxBuffer: 1024 * 1024 })
    return {
      body: new Uint8Array(await readFile(output)),
      mimeType: kind === "video" ? "video/mp4" : "audio/mpeg",
    }
  } finally {
    await rm(folder, { recursive: true, force: true })
  }
}

function safeErrorCode(error: unknown) {
  return (
    (error instanceof Error ? error.message : "GENERATION_FAILED")
      .replace(/[^A-Z0-9_]/g, "_")
      .slice(0, 60) || "GENERATION_FAILED"
  )
}
type GenerationJob = {
  assetId: string
  userId: string
  kind: "background" | "soundscape"
  prompt: string
  month: string
}
