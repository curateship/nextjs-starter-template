import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { and, asc, desc, eq, inArray, isNull, lt, or } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"

import {
  assetPrompt,
  providerMessage,
  shotPieces,
  VEO_MODEL,
  type AssetAspectRatio,
  type ShotLengthSeconds,
  type VideoDurationSeconds,
} from "@/lib/video/asset-factories"
import { requireCanonicalTimeline } from "@/lib/video/timeline-schema"
import {
  checkAiAllowance,
  isAiLimitError,
  recordAiUsage,
  recordDeferredAiSuccess,
} from "@/server/ai/usage"
import { getAiKey } from "@/server/ai/keys"
import { now, uuid } from "@/server/auth/security"
import { db } from "@/server/db"
import { getFromR2 } from "@/server/media/storage"
import { serializeMedia } from "@/server/media/library"
import { customShellMedia } from "@/server/schema"
import { runFfmpeg } from "@/server/video/ffmpeg"
import { writeProjectTimeline } from "@/server/video/projects"
import {
  videoAiGenerations,
  videoFirstFrames,
  videoProjects,
  type VideoAiGenerationRow,
} from "@/server/video/schema"
import { discardGeneratedAsset, saveGeneratedAsset } from "./media"

const outputMedia = alias(customShellMedia, "generation_output_media")
const firstFrameMedia = alias(customShellMedia, "generation_first_frame_media")
const MAX_VIDEO_BYTES = 100 * 1024 * 1024
const JOB_TIMEOUT_MS = 15 * 60 * 1000
const JOB_LEASE_MS = 5 * 60 * 1000
const PROVIDER_REQUEST_TIMEOUT_MS = 90_000
const VIDEO_DOWNLOAD_TIMEOUT_MS = 4 * 60 * 1000

type ClaimedGeneration = VideoAiGenerationRow & { leaseToken: string }

/** A piece after the first is "waiting" until the piece before it is ready. */
export type PieceStatus = "waiting" | "queued" | "processing" | "ready" | "error"
export type GenerationStatus = Exclude<PieceStatus, "waiting">

export type GenerationPiece = {
  id: string
  prompt: string
  duration_seconds: VideoDurationSeconds
  status: PieceStatus
  output_url: string | null
  error_message: string | null
}

/** One shot: a single clip, or up to four pieces that play back to back. */
export type GenerationItem = {
  id: string
  project_name: string
  first_frame_image_url: string | null
  aspect_ratio: AssetAspectRatio
  duration_seconds: number
  status: GenerationStatus
  error_message: string | null
  pieces: GenerationPiece[]
}

type VeoOperation = {
  name?: string
  done?: boolean
  error?: { message?: string }
  response?: {
    generatedVideos?: Array<{ video?: { uri?: string } }>
    generateVideoResponse?: {
      generatedSamples?: Array<{ video?: { uri?: string } }>
    }
  }
}

type GenerationJoin = {
  generation: VideoAiGenerationRow
  projectName: string
  output: typeof customShellMedia.$inferSelect | null
  firstFrame: typeof customShellMedia.$inferSelect | null
}

async function serializePiece(row: GenerationJoin): Promise<GenerationPiece> {
  return {
    id: row.generation.id,
    prompt: row.generation.prompt,
    duration_seconds: row.generation.durationSeconds as VideoDurationSeconds,
    status: row.generation.status as PieceStatus,
    output_url: row.output ? (await serializeMedia(row.output)).url : null,
    error_message: row.generation.errorMessage,
  }
}

/**
 * A shot is ready when every piece is and failed when any piece failed. Once
 * one piece has been made it counts as generating until then, even in the
 * moment its next piece is queued. `rows` is one shot's pieces in order.
 */
async function serializeShot(rows: GenerationJoin[]): Promise<GenerationItem> {
  const [first] = rows
  const pieces = await Promise.all(rows.map(serializePiece))
  const failed = pieces.find((piece) => piece.status === "error")
  const status: GenerationStatus = failed
    ? "error"
    : pieces.length === first.generation.shotPieces &&
        pieces.every((piece) => piece.status === "ready")
      ? "ready"
      : pieces.some((piece) => piece.status === "processing" || piece.status === "ready")
        ? "processing"
        : "queued"
  return {
    id: first.generation.shotId,
    project_name: first.projectName,
    first_frame_image_url: first.firstFrame
      ? (await serializeMedia(first.firstFrame)).url
      : null,
    aspect_ratio: first.generation.aspectRatio as AssetAspectRatio,
    duration_seconds: pieces.reduce((sum, piece) => sum + piece.duration_seconds, 0),
    status,
    error_message: failed?.error_message ?? null,
    pieces,
  }
}

function generationRows(userId: string, shotId?: string) {
  return db
    .select({
      generation: videoAiGenerations,
      projectName: videoProjects.name,
      output: outputMedia,
      firstFrame: firstFrameMedia,
    })
    .from(videoAiGenerations)
    .innerJoin(
      videoProjects,
      and(
        eq(videoAiGenerations.projectId, videoProjects.id),
        eq(videoProjects.userId, userId)
      )
    )
    .leftJoin(
      outputMedia,
      and(
        eq(videoAiGenerations.outputMediaId, outputMedia.id),
        eq(outputMedia.userId, userId)
      )
    )
    .leftJoin(
      firstFrameMedia,
      and(
        eq(videoAiGenerations.firstFrameMediaId, firstFrameMedia.id),
        eq(firstFrameMedia.userId, userId)
      )
    )
    .where(
      and(
        eq(videoAiGenerations.userId, userId),
        shotId ? eq(videoAiGenerations.shotId, shotId) : undefined
      )
    )
}

function groupShots(rows: GenerationJoin[]) {
  const shots = new Map<string, GenerationJoin[]>()
  for (const row of rows) {
    const shot = shots.get(row.generation.shotId)
    if (shot) shot.push(row)
    else shots.set(row.generation.shotId, [row])
  }
  return [...shots.values()]
}

/** Newest shot first, each shot's pieces in the order they play. */
export async function listGenerations(userId: string) {
  const rows = await generationRows(userId).orderBy(
    desc(videoAiGenerations.createdAt),
    asc(videoAiGenerations.shotId),
    asc(videoAiGenerations.shotIndex)
  )
  return { generations: await Promise.all(groupShots(rows).map(serializeShot)) }
}

async function getShot(userId: string, shotId: string) {
  const rows = await generationRows(userId, shotId).orderBy(
    asc(videoAiGenerations.shotIndex)
  )
  if (!rows.length) throw new Error("AI video generation not found")
  return rows
}

export async function createGeneration(
  userId: string,
  payload: {
    projectId: string
    firstFrameId: string
    prompts: string[]
    lengthSeconds: ShotLengthSeconds
  }
) {
  const pieces = shotPieces(payload.lengthSeconds)
  if (payload.prompts.length !== pieces.count) {
    throw new Error("Write one direction for each piece of the shot")
  }
  const prompts = payload.prompts.map(assetPrompt)
  const [project] = await db
    .select({ id: videoProjects.id, name: videoProjects.name })
    .from(videoProjects)
    .where(
      and(eq(videoProjects.id, payload.projectId), eq(videoProjects.userId, userId))
    )
    .limit(1)
  if (!project) throw new Error("Project not found")

  const [frame] = await db
    .select({ frame: videoFirstFrames, media: customShellMedia })
    .from(videoFirstFrames)
    .innerJoin(
      customShellMedia,
      and(
        eq(videoFirstFrames.imageMediaId, customShellMedia.id),
        eq(customShellMedia.userId, userId)
      )
    )
    .where(
      and(
        eq(videoFirstFrames.id, payload.firstFrameId),
        eq(videoFirstFrames.userId, userId)
      )
    )
    .limit(1)
  if (!frame) throw new Error("First frame not found")
  if (frame.media.fileType !== "image") throw new Error("First frame is not an image")
  if (!(await getAiKey("gemini"))) {
    throw new Error("Add a Google Gemini key in Settings first")
  }
  await checkAiAllowance(userId)

  const active = await db
    .select({ id: videoAiGenerations.id })
    .from(videoAiGenerations)
    .where(
      and(
        eq(videoAiGenerations.projectId, payload.projectId),
        // A shot stopped by a failed piece still has pieces waiting behind
        // it, and a second shot would take the project's one running slot
        // that its Retry needs.
        inArray(videoAiGenerations.status, ["waiting", "queued", "processing"])
      )
    )
    .limit(1)
  if (active.length) throw new Error("This project already has a video generating")

  const at = now()
  const shotId = uuid()
  // Every piece is written now, so the directions are kept. Only the first
  // has a starting picture; each later one gets the last frame of the piece
  // before it once that piece is ready.
  const created = await db
    .insert(videoAiGenerations)
    .values(
      prompts.map((prompt, index) => ({
        id: index === 0 ? shotId : uuid(),
        userId,
        projectId: payload.projectId,
        firstFrameId: frame.frame.id,
        firstFrameMediaId: index === 0 ? frame.media.id : null,
        prompt,
        model: VEO_MODEL,
        aspectRatio: frame.frame.aspectRatio,
        durationSeconds: pieces.seconds,
        shotId,
        shotIndex: index + 1,
        shotPieces: pieces.count,
        status: index === 0 ? "queued" : "waiting",
        attempts: 0,
        createdAt: at,
        updatedAt: at,
      }))
    )
    .returning()
  return await serializeShot(
    created.map((generation) => ({
      generation,
      projectName: project.name,
      output: null,
      firstFrame: generation.shotIndex === 1 ? frame.media : null,
    }))
  )
}

/** Runs a shot's failed piece again. The pieces after it carry on from there. */
export async function retryGeneration(userId: string, shotId: string) {
  const failed = and(
    eq(videoAiGenerations.shotId, shotId),
    eq(videoAiGenerations.userId, userId),
    eq(videoAiGenerations.status, "error")
  )
  const [piece] = await db
    .select({ projectId: videoAiGenerations.projectId })
    .from(videoAiGenerations)
    .where(failed)
    .limit(1)
  if (!piece) throw new Error("Only failed generations can be retried")
  // A shot whose last piece failed has nothing waiting behind it, so another
  // video may have started on the project since. The project runs one at a
  // time.
  const [active] = await db
    .select({ id: videoAiGenerations.id })
    .from(videoAiGenerations)
    .where(
      and(
        eq(videoAiGenerations.projectId, piece.projectId),
        inArray(videoAiGenerations.status, ["queued", "processing"])
      )
    )
    .limit(1)
  if (active) throw new Error("This project already has a video generating")
  const [updated] = await db
    .update(videoAiGenerations)
    .set({
      status: "queued",
      operationName: null,
      leaseToken: null,
      leaseExpiresAt: null,
      outputMediaId: null,
      errorMessage: null,
      startedAt: null,
      finishedAt: null,
      updatedAt: now(),
    })
    .where(failed)
    .returning({ id: videoAiGenerations.id })
  if (!updated) throw new Error("Only failed generations can be retried")
  return await serializeShot(await getShot(userId, shotId))
}

/** Deletes whole shots, every piece of each. */
export async function deleteGenerations(userId: string, shotIds: string[]) {
  const ids = [...new Set(shotIds)]
  if (!ids.length) return { deleted_ids: [] as string[] }
  const active = await db
    .select({ id: videoAiGenerations.id })
    .from(videoAiGenerations)
    .where(
      and(
        eq(videoAiGenerations.userId, userId),
        inArray(videoAiGenerations.shotId, ids),
        inArray(videoAiGenerations.status, ["queued", "processing"])
      )
    )
    .limit(1)
  if (active.length) {
    throw new Error("A video that is still generating cannot be deleted")
  }
  const rows = await db
    .delete(videoAiGenerations)
    .where(
      and(
        eq(videoAiGenerations.userId, userId),
        inArray(videoAiGenerations.shotId, ids),
        inArray(videoAiGenerations.status, ["waiting", "ready", "error"])
      )
    )
    .returning({ shotId: videoAiGenerations.shotId })
  return { deleted_ids: [...new Set(rows.map((row) => row.shotId))] }
}

/**
 * Lays a finished shot on a new track of the project, every piece straight
 * after the one before, from the start of the timeline.
 */
export async function insertGeneration(
  userId: string,
  shotId: string,
  projectId: string
) {
  const shot = await getShot(userId, shotId)
  const outputs = shot.flatMap((row) =>
    row.generation.status === "ready" && row.output ? [row.output] : []
  )
  if (outputs.length !== shot[0].generation.shotPieces) {
    throw new Error("Only ready generations can be inserted")
  }
  const [project] = await db
    .select()
    .from(videoProjects)
    .where(and(eq(videoProjects.id, projectId), eq(videoProjects.userId, userId)))
    .limit(1)
  if (!project) throw new Error("Project not found")
  const timeline = requireCanonicalTimeline(project.timeline)
  if (timeline.tracks.length >= 50) throw new Error("Project timeline is full")
  const durationMs = shot[0].generation.durationSeconds * 1_000
  const clips = await Promise.all(
    outputs.map(async (output, index) => {
      const media = await serializeMedia(output)
      return {
        id: uuid(),
        kind: "video" as const,
        name: media.original_name,
        startMs: index * durationMs,
        durationMs,
        trimStartMs: 0,
        sourceDurationMs: durationMs,
        mediaId: media.id,
        url: media.url,
      }
    })
  )
  const next = requireCanonicalTimeline({
    ...timeline,
    tracks: [...timeline.tracks, { id: uuid(), muted: false, clips }],
  })
  await writeProjectTimeline(userId, project.id, next, project.version)
  return { project_id: project.id, project_name: project.name }
}

async function failJob(job: ClaimedGeneration, error: unknown) {
  const message = error instanceof Error ? error.message : "AI video generation failed"
  const [failed] = await db
    .update(videoAiGenerations)
    .set({
      status: "error",
      leaseToken: null,
      leaseExpiresAt: null,
      errorMessage: message.slice(0, 500),
      updatedAt: now(),
      finishedAt: now(),
    })
    .where(
      and(
        eq(videoAiGenerations.id, job.id),
        eq(videoAiGenerations.status, "processing"),
        eq(videoAiGenerations.leaseToken, job.leaseToken)
      )
    )
    .returning({ id: videoAiGenerations.id })
  if (!failed) return
  await recordAiUsage({
    userId: job.userId,
    provider: "gemini",
    model: VEO_MODEL,
    feature: "video-generation",
    inputTokens: 0,
    outputTokens: 0,
    status: isAiLimitError(error) ? "blocked" : "failed",
    metadata: { generationId: job.id, error: message },
  })
}

async function startJob(job: ClaimedGeneration) {
  try {
    await checkAiAllowance(job.userId)
    const apiKey = await getAiKey("gemini")
    if (!apiKey) throw new Error("Add a Google Gemini key in Settings first")
    const [frame] = await db
      .select({ media: customShellMedia })
      .from(customShellMedia)
      .where(
        and(
          eq(customShellMedia.id, job.firstFrameMediaId ?? ""),
          eq(customShellMedia.userId, job.userId)
        )
      )
      .limit(1)
    if (!frame) throw new Error("First frame image is missing")
    const object = await getFromR2(frame.media.storagePath)
    const bytes = await object.Body?.transformToByteArray()
    if (!bytes?.byteLength) throw new Error("First frame image could not be read")
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${VEO_MODEL}:predictLongRunning`,
      {
        method: "POST",
        signal: AbortSignal.timeout(PROVIDER_REQUEST_TIMEOUT_MS),
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          instances: [
            {
              prompt: `${job.prompt}\n\nUse the supplied image as the exact first frame. Do not add captions or on-screen text.`,
              image: {
                inlineData: {
                  mimeType: frame.media.mimeType,
                  data: Buffer.from(bytes).toString("base64"),
                },
              },
            },
          ],
          parameters: {
            aspectRatio: job.aspectRatio,
            durationSeconds: String(job.durationSeconds),
            resolution: "720p",
            personGeneration: "allow_adult",
          },
        }),
      }
    )
    if (!response.ok) {
      const detail = providerMessage(await response.text())
      throw new Error(`Google could not start the video${detail ? `: ${detail}` : "."}`)
    }
    const operation = (await response.json()) as VeoOperation
    if (!operation.name) throw new Error("Google did not return a video job")
    const [updated] = await db
      .update(videoAiGenerations)
      .set({
        operationName: operation.name,
        leaseToken: null,
        leaseExpiresAt: null,
        updatedAt: now(),
      })
      .where(
        and(
          eq(videoAiGenerations.id, job.id),
          eq(videoAiGenerations.status, "processing"),
          eq(videoAiGenerations.leaseToken, job.leaseToken)
        )
      )
      .returning({ id: videoAiGenerations.id })
    if (!updated) {
      throw new Error("The video job lease expired before Google accepted it")
    }
  } catch (error) {
    await failJob(job, error)
  }
}

async function readBytes(response: Response) {
  const declared = Number(response.headers.get("content-length") ?? 0)
  if (declared > MAX_VIDEO_BYTES) throw new Error("Google returned a video larger than 100MB")
  const reader = response.body?.getReader()
  if (!reader) throw new Error("Google returned an empty video")
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > MAX_VIDEO_BYTES) {
      await reader.cancel()
      throw new Error("Google returned a video larger than 100MB")
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  if (!bytes.byteLength) throw new Error("Google returned an empty video")
  return bytes
}

function videoUri(operation: VeoOperation) {
  return (
    operation.response?.generatedVideos?.[0]?.video?.uri ??
    operation.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri ??
    null
  )
}

/**
 * The very last frame of a finished piece, as a PNG, for the next piece to
 * start from. `-sseof -1` reads only the final second, and `-update 1` keeps
 * overwriting one picture, so the frame left behind is the last one.
 */
async function lastFrame(video: Uint8Array) {
  const dir = await mkdtemp(path.join(tmpdir(), "video-shot-frame-"))
  try {
    const source = path.join(dir, "piece.mp4")
    const frame = path.join(dir, "last.png")
    await writeFile(source, video)
    await runFfmpeg(
      ["-sseof", "-1", "-i", source, "-update", "1", frame],
      "The last frame of the clip could not be read, so the next piece cannot start. Retry it."
    )
    return new Uint8Array(await readFile(frame))
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

async function releaseJob(job: ClaimedGeneration) {
  await db
    .update(videoAiGenerations)
    .set({ leaseToken: null, leaseExpiresAt: null, updatedAt: now() })
    .where(
      and(
        eq(videoAiGenerations.id, job.id),
        eq(videoAiGenerations.status, "processing"),
        eq(videoAiGenerations.leaseToken, job.leaseToken)
      )
    )
}

async function pollJob(job: ClaimedGeneration) {
  let generatedMedia: Awaited<ReturnType<typeof saveGeneratedAsset>> | null = null
  let nextFrame: Awaited<ReturnType<typeof saveGeneratedAsset>> | null = null
  try {
    if (!job.operationName) {
      if (
        now().getTime() - (job.startedAt ?? job.updatedAt).getTime() > 60_000
      ) {
        throw new Error("The video job stopped before Google accepted it. Retry it.")
      }
      await releaseJob(job)
      return
    }
    if (
      now().getTime() - (job.startedAt ?? job.updatedAt).getTime() >
      JOB_TIMEOUT_MS
    ) {
      throw new Error("Google took longer than 15 minutes. Retry the video.")
    }
    const apiKey = await getAiKey("gemini")
    if (!apiKey) throw new Error("Add a Google Gemini key in Settings first")
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${job.operationName}`,
      {
        headers: { "x-goog-api-key": apiKey },
        signal: AbortSignal.timeout(PROVIDER_REQUEST_TIMEOUT_MS),
      }
    )
    if (!response.ok) {
      const detail = providerMessage(await response.text())
      throw new Error(`Google could not check the video${detail ? `: ${detail}` : "."}`)
    }
    const operation = (await response.json()) as VeoOperation
    if (operation.error) {
      throw new Error(
        `Google could not generate the video${operation.error.message ? `: ${operation.error.message}` : "."}`
      )
    }
    if (!operation.done) {
      await releaseJob(job)
      return
    }
    const uri = videoUri(operation)
    if (!uri) throw new Error("Google finished without returning a video")
    const url = new URL(uri)
    if (url.protocol !== "https:" || url.hostname !== "generativelanguage.googleapis.com") {
      throw new Error("Google returned an invalid video address")
    }
    const download = await fetch(url, {
      headers: { "x-goog-api-key": apiKey },
      signal: AbortSignal.timeout(VIDEO_DOWNLOAD_TIMEOUT_MS),
    })
    if (!download.ok) {
      throw new Error(`Google could not download the video: ${providerMessage(await download.text())}`)
    }
    const video = await readBytes(download)
    const hasNext = job.shotIndex < job.shotPieces
    // Taken before anything is saved, so a frame that cannot be read fails
    // this piece, whose Retry makes it again, rather than leaving a ready
    // piece with nothing for the next one to start from.
    const frameBytes = hasNext ? await lastFrame(video) : null
    generatedMedia = await saveGeneratedAsset({
      userId: job.userId,
      bytes: video,
      mimeType: "video/mp4",
      fileType: "video",
      name: "AI video",
    })
    if (frameBytes) {
      nextFrame = await saveGeneratedAsset({
        userId: job.userId,
        bytes: frameBytes,
        mimeType: "image/png",
        fileType: "image",
        name: `AI shot frame ${job.shotIndex}`,
      })
    }
    const finished = now()
    const outputId = generatedMedia.id
    const nextFrameId = nextFrame?.id ?? null
    const finishedJob = await db.transaction(async (tx) => {
      const [done] = await tx
        .update(videoAiGenerations)
        .set({
          status: "ready",
          leaseToken: null,
          leaseExpiresAt: null,
          outputMediaId: outputId,
          errorMessage: null,
          updatedAt: finished,
          finishedAt: finished,
        })
        .where(
          and(
            eq(videoAiGenerations.id, job.id),
            eq(videoAiGenerations.status, "processing"),
            eq(videoAiGenerations.leaseToken, job.leaseToken)
          )
        )
        .returning({ id: videoAiGenerations.id })
      // In the same step as the piece before turning ready, so a shot is
      // never left with a ready piece and nothing queued after it. This
      // runs second because a project holds one queued or running row.
      if (done && nextFrameId) {
        await tx
          .update(videoAiGenerations)
          .set({ status: "queued", firstFrameMediaId: nextFrameId, updatedAt: finished })
          .where(
            and(
              eq(videoAiGenerations.shotId, job.shotId),
              eq(videoAiGenerations.shotIndex, job.shotIndex + 1),
              eq(videoAiGenerations.status, "waiting")
            )
          )
      }
      return done
    })
    if (!finishedJob) {
      await discardGeneratedAsset(generatedMedia)
      if (nextFrame) await discardGeneratedAsset(nextFrame)
      return
    }
    generatedMedia = null
    nextFrame = null
    await recordDeferredAiSuccess(
      {
        userId: job.userId,
        provider: "gemini",
        model: VEO_MODEL,
        feature: "video-generation",
        metadata: { generationId: job.id, shotId: job.shotId },
      },
      { inputTokens: 0, outputTokens: 0, units: job.durationSeconds }
    )
  } catch (error) {
    if (generatedMedia) await discardGeneratedAsset(generatedMedia)
    if (nextFrame) await discardGeneratedAsset(nextFrame)
    await failJob(job, error)
  }
}

async function claimQueuedJob(): Promise<ClaimedGeneration | null> {
  const [queued] = await db
    .select()
    .from(videoAiGenerations)
    .where(eq(videoAiGenerations.status, "queued"))
    .orderBy(asc(videoAiGenerations.createdAt))
    .limit(1)
  if (!queued) return null

  const leaseToken = uuid()
  const claimedAt = now()
  const [claimed] = await db
    .update(videoAiGenerations)
    .set({
      status: "processing",
      attempts: queued.attempts + 1,
      leaseToken,
      leaseExpiresAt: new Date(claimedAt.getTime() + JOB_LEASE_MS),
      startedAt: queued.startedAt ?? claimedAt,
      updatedAt: claimedAt,
    })
    .where(
      and(
        eq(videoAiGenerations.id, queued.id),
        eq(videoAiGenerations.status, "queued")
      )
    )
    .returning()
  return claimed ? { ...claimed, leaseToken } : null
}

async function claimProcessingJob(): Promise<ClaimedGeneration | null> {
  const timestamp = now()
  const available = or(
    isNull(videoAiGenerations.leaseToken),
    lt(videoAiGenerations.leaseExpiresAt, timestamp)
  )
  const [processing] = await db
    .select()
    .from(videoAiGenerations)
    .where(and(eq(videoAiGenerations.status, "processing"), available))
    .orderBy(asc(videoAiGenerations.updatedAt))
    .limit(1)
  if (!processing) return null

  const leaseToken = uuid()
  const [claimed] = await db
    .update(videoAiGenerations)
    .set({
      leaseToken,
      leaseExpiresAt: new Date(timestamp.getTime() + JOB_LEASE_MS),
      updatedAt: timestamp,
    })
    .where(
      and(
        eq(videoAiGenerations.id, processing.id),
        eq(videoAiGenerations.status, "processing"),
        available
      )
    )
    .returning()
  return claimed ? { ...claimed, leaseToken } : null
}

/** One durable generation step per shell tick. */
export async function videoGenerationTick() {
  const queued = await claimQueuedJob()
  if (queued) {
    await startJob(queued)
    return
  }

  const processing = await claimProcessingJob()
  if (processing) await pollJob(processing)
}
