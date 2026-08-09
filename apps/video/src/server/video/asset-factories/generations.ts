import { and, asc, desc, eq, inArray, isNull, lt, or } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"

import {
  assetPrompt,
  providerMessage,
  VEO_MODEL,
  type AssetAspectRatio,
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

export type GenerationStatus = "queued" | "processing" | "ready" | "error"

export type GenerationItem = {
  id: string
  project_id: string
  project_name: string
  first_frame_id: string
  first_frame_image_url: string | null
  prompt: string
  model: string
  aspect_ratio: AssetAspectRatio
  duration_seconds: VideoDurationSeconds
  status: GenerationStatus
  output_media_id: string | null
  output_url: string | null
  error_message: string | null
  attempts: number
  created_at: string
  updated_at: string
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

function serializeGeneration(row: GenerationJoin): GenerationItem {
  return {
    id: row.generation.id,
    project_id: row.generation.projectId,
    project_name: row.projectName,
    first_frame_id: row.generation.firstFrameId,
    first_frame_image_url: row.firstFrame
      ? serializeMedia(row.firstFrame).url
      : null,
    prompt: row.generation.prompt,
    model: row.generation.model,
    aspect_ratio: row.generation.aspectRatio as AssetAspectRatio,
    duration_seconds: row.generation.durationSeconds as VideoDurationSeconds,
    status: row.generation.status as GenerationStatus,
    output_media_id: row.generation.outputMediaId,
    output_url: row.output ? serializeMedia(row.output).url : null,
    error_message: row.generation.errorMessage,
    attempts: row.generation.attempts,
    created_at: row.generation.createdAt.toISOString(),
    updated_at: row.generation.updatedAt.toISOString(),
  }
}

function generationRows(userId: string, generationId?: string) {
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
        generationId ? eq(videoAiGenerations.id, generationId) : undefined
      )
    )
}

export async function listGenerations(userId: string) {
  const rows = await generationRows(userId).orderBy(
    desc(videoAiGenerations.createdAt)
  )
  return { generations: rows.map(serializeGeneration) }
}

async function getGeneration(userId: string, generationId: string) {
  const [row] = await generationRows(userId, generationId).limit(1)
  if (!row) throw new Error("AI video generation not found")
  return row
}

export async function createGeneration(
  userId: string,
  payload: {
    projectId: string
    firstFrameId: string
    prompt: string
    durationSeconds: VideoDurationSeconds
  }
) {
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
        inArray(videoAiGenerations.status, ["queued", "processing"])
      )
    )
    .limit(1)
  if (active.length) throw new Error("This project already has a video generating")

  const at = now()
  const [created] = await db
    .insert(videoAiGenerations)
    .values({
      id: uuid(),
      userId,
      projectId: payload.projectId,
      firstFrameId: frame.frame.id,
      firstFrameMediaId: frame.media.id,
      prompt: assetPrompt(payload.prompt),
      model: VEO_MODEL,
      aspectRatio: frame.frame.aspectRatio,
      durationSeconds: payload.durationSeconds,
      status: "queued",
      attempts: 0,
      createdAt: at,
      updatedAt: at,
    })
    .returning()
  return serializeGeneration({
    generation: created,
    projectName: project.name,
    output: null,
    firstFrame: frame.media,
  })
}

export async function retryGeneration(userId: string, generationId: string) {
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
    .where(
      and(
        eq(videoAiGenerations.id, generationId),
        eq(videoAiGenerations.userId, userId),
        eq(videoAiGenerations.status, "error")
      )
    )
    .returning({ id: videoAiGenerations.id })
  if (!updated) throw new Error("Only failed generations can be retried")
  return serializeGeneration(await getGeneration(userId, generationId))
}

export async function deleteGenerations(userId: string, generationIds: string[]) {
  const ids = [...new Set(generationIds)]
  if (!ids.length) return { deleted_ids: [] as string[] }
  const active = await db
    .select({ id: videoAiGenerations.id })
    .from(videoAiGenerations)
    .where(
      and(
        eq(videoAiGenerations.userId, userId),
        inArray(videoAiGenerations.id, ids),
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
        inArray(videoAiGenerations.id, ids),
        inArray(videoAiGenerations.status, ["ready", "error"])
      )
    )
    .returning({ id: videoAiGenerations.id })
  return { deleted_ids: rows.map((row) => row.id) }
}

export async function insertGeneration(
  userId: string,
  generationId: string,
  projectId: string
) {
  const joined = await getGeneration(userId, generationId)
  if (joined.generation.status !== "ready" || !joined.output) {
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
  const media = serializeMedia(joined.output)
  const durationMs = joined.generation.durationSeconds * 1_000
  const next = requireCanonicalTimeline({
    ...timeline,
    tracks: [
      ...timeline.tracks,
      {
        id: uuid(),
        muted: false,
        clips: [
          {
            id: uuid(),
            kind: "video",
            name: media.original_name,
            startMs: 0,
            durationMs,
            trimStartMs: 0,
            sourceDurationMs: durationMs,
            mediaId: media.id,
            url: media.url,
          },
        ],
      },
    ],
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
    generatedMedia = await saveGeneratedAsset({
      userId: job.userId,
      bytes: await readBytes(download),
      mimeType: "video/mp4",
      fileType: "video",
      name: "AI video",
    })
    const finished = now()
    const [finishedJob] = await db
      .update(videoAiGenerations)
      .set({
        status: "ready",
        leaseToken: null,
        leaseExpiresAt: null,
        outputMediaId: generatedMedia.id,
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
    if (!finishedJob) {
      await discardGeneratedAsset(generatedMedia)
      return
    }
    generatedMedia = null
    await recordDeferredAiSuccess(
      {
        userId: job.userId,
        provider: "gemini",
        model: VEO_MODEL,
        feature: "video-generation",
        metadata: { generationId: job.id },
      },
      { inputTokens: 0, outputTokens: 0, units: job.durationSeconds }
    )
  } catch (error) {
    if (generatedMedia) await discardGeneratedAsset(generatedMedia)
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
