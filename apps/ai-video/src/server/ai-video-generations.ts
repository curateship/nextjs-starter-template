import { and, desc, eq, inArray } from "drizzle-orm"

import type { MediaItem } from "@/server/media"
import { db } from "@/server/db"
import { getLlmKey } from "@/server/llm-keys"
import {
  saveGeneratedVideoToProjectMedia,
  serializeMedia,
} from "@/server/media"
import { bodyToBytes, getFromR2 } from "@/server/media-storage"
import { requireAppOrigin } from "@/server/origin"
import {
  aiVideoFirstFrames,
  aiVideoGenerations,
  aiVideoMedia,
  aiVideoProjects,
  type AiVideoGeneration,
  type AiVideoMedia,
} from "@/server/schema"
import { now, requireUser, uuid } from "@/server/security"
import { GEMINI_BASE_URL, safeBody } from "@/server/video-analysis"

const AI_VIDEO_MODEL = "veo-3.1-generate-preview"
const AI_VIDEO_RESOLUTION = "720p"
const AI_VIDEO_POLL_INTERVAL_MS = 10_000
const AI_VIDEO_TIMEOUT_MS = 8 * 60 * 1000
const AI_VIDEO_ASPECT_RATIOS = ["9:16", "16:9"] as const
const AI_VIDEO_ACTIVE_STATUSES = ["queued", "processing"] as const

export type AiVideoGenerationStatus =
  | "queued"
  | "processing"
  | "ready"
  | "error"
export type AiVideoAspectRatio = (typeof AI_VIDEO_ASPECT_RATIOS)[number]
export type AiVideoDurationSeconds = 4 | 6 | 8

export type AiVideoGenerationItem = {
  id: string
  project_id: string
  first_frame_id: string
  first_frame_media_id: string | null
  prompt: string
  model: string
  aspect_ratio: AiVideoAspectRatio
  duration_seconds: AiVideoDurationSeconds
  resolution: string
  status: AiVideoGenerationStatus
  requested_playhead_ms: number
  media: MediaItem | null
  error_message: string | null
  created_at: string
  updated_at: string
}

export type CreateAiVideoGenerationPayload = {
  projectId: string
  firstFrameId: string
  prompt: string
  durationSeconds: AiVideoDurationSeconds
  requestedPlayheadMs: number
}

type VeoOperation = {
  name?: string
  done?: boolean
  error?: { message?: string }
  response?: {
    generatedVideos?: { video?: { uri?: string } }[]
  }
}

export async function createAiVideoGenerationForCurrentUser(
  data: CreateAiVideoGenerationPayload
): Promise<AiVideoGenerationItem> {
  requireAppOrigin()
  const user = await requireUser()
  await requireOwnedProject(user.id, data.projectId)
  const joined = await getOwnedFirstFrameWithMedia(user.id, data.firstFrameId)
  if (!joined?.media) {
    throw new Error("First frame image is missing")
  }
  if (joined.media.fileType !== "image") {
    throw new Error("First frame media must be an image")
  }
  const aspectRatio = joined.firstFrame.aspectRatio
  if (!isAiVideoAspectRatio(aspectRatio)) {
    throw new Error("First frame aspect is not supported for AI Video")
  }
  const prompt = cleanAiVideoPrompt(data.prompt)
  const activeGeneration = await getActiveGenerationJoin(user.id, data.projectId)
  if (activeGeneration) {
    return serializeGeneration(activeGeneration.generation, activeGeneration.media)
  }

  const apiKey = await getLlmKey("gemini")
  if (!apiKey) {
    throw new Error("AI video generation is not configured")
  }

  const createdAt = now()
  const row = {
    id: uuid(),
    userId: user.id,
    projectId: data.projectId,
    firstFrameId: joined.firstFrame.id,
    firstFrameMediaId: joined.media.id,
    prompt,
    model: AI_VIDEO_MODEL,
    aspectRatio,
    durationSeconds: data.durationSeconds,
    resolution: AI_VIDEO_RESOLUTION,
    status: "queued" as const,
    operationName: null,
    requestedPlayheadMs: Math.max(0, Math.round(data.requestedPlayheadMs)),
    mediaId: null,
    errorMessage: null,
    createdAt,
    updatedAt: createdAt,
  }

  const [created] = await db.insert(aiVideoGenerations).values(row).returning()
  if (!created) {
    throw new Error("AI video generation was not created")
  }

  void processAiVideoGeneration(created.id, apiKey).catch((error) => {
    console.error("AI video generation crashed", created.id, error)
  })

  return serializeGeneration(created, null)
}

export async function getAiVideoGenerationForCurrentUser(
  generationId: string
): Promise<AiVideoGenerationItem> {
  const user = await requireUser()
  const joined = await getGenerationJoin(user.id, generationId)
  if (!joined) {
    throw new Error("AI video generation not found")
  }
  return serializeGeneration(joined.generation, joined.media)
}

export async function getLatestAiVideoGenerationForCurrentUser(
  projectId: string
): Promise<AiVideoGenerationItem | null> {
  const user = await requireUser()
  await requireOwnedProject(user.id, projectId)
  const [row] = await db
    .select({ generation: aiVideoGenerations, media: aiVideoMedia })
    .from(aiVideoGenerations)
    .leftJoin(
      aiVideoMedia,
      and(
        eq(aiVideoGenerations.mediaId, aiVideoMedia.id),
        eq(aiVideoMedia.userId, user.id)
      )
    )
    .where(
      and(
        eq(aiVideoGenerations.userId, user.id),
        eq(aiVideoGenerations.projectId, projectId)
      )
    )
    .orderBy(desc(aiVideoGenerations.updatedAt))
    .limit(1)

  return row ? serializeGeneration(row.generation, row.media) : null
}

async function processAiVideoGeneration(generationId: string, apiKey: string) {
  try {
    const joined = await getGenerationProcessInput(generationId)
    if (!joined?.media) {
      throw new Error("First frame image is missing")
    }

    const object = await getFromR2(joined.media.storagePath)
    const imageBytes = await bodyToBytes(object.Body)
    const operationName = await startVeoOperation({
      apiKey,
      prompt: composeVeoPrompt(joined.generation.prompt),
      imageBytes,
      imageMimeType: joined.media.mimeType,
      aspectRatio: joined.generation.aspectRatio as AiVideoAspectRatio,
      durationSeconds:
        joined.generation.durationSeconds as AiVideoDurationSeconds,
    })

    await db
      .update(aiVideoGenerations)
      .set({
        status: "processing",
        operationName,
        updatedAt: now(),
      })
      .where(eq(aiVideoGenerations.id, generationId))

    const operation = await waitForVeoOperation(operationName, apiKey)
    const videoUri = extractVideoUri(operation)
    const videoBytes = await downloadVeoVideo(videoUri, apiKey)
    const media = await saveGeneratedVideoToProjectMedia(
      joined.generation.userId,
      joined.generation.projectId,
      videoBytes,
      `${joined.firstFrame.name} AI Video.mp4`
    )

    await db
      .update(aiVideoGenerations)
      .set({
        status: "ready",
        mediaId: media.id,
        errorMessage: null,
        updatedAt: now(),
      })
      .where(eq(aiVideoGenerations.id, generationId))
  } catch (error) {
    console.error("AI video generation failed", generationId, error)
    await db
      .update(aiVideoGenerations)
      .set({
        status: "error",
        errorMessage: "AI video generation failed",
        updatedAt: now(),
      })
      .where(eq(aiVideoGenerations.id, generationId))
  }
}

async function startVeoOperation({
  apiKey,
  prompt,
  imageBytes,
  imageMimeType,
  aspectRatio,
  durationSeconds,
}: {
  apiKey: string
  prompt: string
  imageBytes: Uint8Array
  imageMimeType: string
  aspectRatio: AiVideoAspectRatio
  durationSeconds: AiVideoDurationSeconds
}) {
  const response = await fetch(
    `${GEMINI_BASE_URL}/v1beta/models/${AI_VIDEO_MODEL}:predictLongRunning`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        instances: [
          {
            prompt,
            image: {
              inlineData: {
                mimeType: imageMimeType,
                data: Buffer.from(imageBytes).toString("base64"),
              },
            },
          },
        ],
        parameters: {
          aspectRatio,
          durationSeconds: String(durationSeconds),
          resolution: AI_VIDEO_RESOLUTION,
          personGeneration: "allow_adult",
        },
      }),
    }
  )

  if (!response.ok) {
    console.error("Veo generation start failed", await safeBody(response))
    throw new Error("AI video generation failed")
  }

  const payload = (await response.json()) as VeoOperation
  if (!payload.name) {
    throw new Error("AI video generation failed")
  }
  return payload.name
}

async function waitForVeoOperation(operationName: string, apiKey: string) {
  const deadline = Date.now() + AI_VIDEO_TIMEOUT_MS

  while (Date.now() < deadline) {
    const response = await fetch(`${GEMINI_BASE_URL}/v1beta/${operationName}`, {
      headers: { "x-goog-api-key": apiKey },
    })
    if (!response.ok) {
      console.error("Veo generation poll failed", await safeBody(response))
      throw new Error("AI video generation failed")
    }

    const operation = (await response.json()) as VeoOperation
    if (operation.error) {
      console.error("Veo generation returned error", operation.error)
      throw new Error("AI video generation failed")
    }
    if (operation.done) return operation

    await new Promise((resolve) =>
      setTimeout(resolve, AI_VIDEO_POLL_INTERVAL_MS)
    )
  }

  throw new Error("AI video generation failed")
}

async function downloadVeoVideo(videoUri: string, apiKey: string) {
  const response = await fetch(validateVeoDownloadUrl(videoUri), {
    headers: { "x-goog-api-key": apiKey },
  })
  if (!response.ok) {
    console.error("Veo video download failed", await safeBody(response))
    throw new Error("AI video generation failed")
  }
  return new Uint8Array(await response.arrayBuffer())
}

function validateVeoDownloadUrl(videoUri: string) {
  let url: URL
  try {
    url = new URL(videoUri)
  } catch {
    throw new Error("AI video generation failed")
  }

  if (
    url.protocol !== "https:" ||
    url.hostname !== "generativelanguage.googleapis.com"
  ) {
    throw new Error("AI video generation failed")
  }

  return url.toString()
}

function extractVideoUri(operation: VeoOperation) {
  const uri = operation.response?.generatedVideos?.[0]?.video?.uri
  if (!uri) {
    throw new Error("AI video generation failed")
  }
  return uri
}

async function requireOwnedProject(userId: string, projectId: string) {
  const [row] = await db
    .select({ id: aiVideoProjects.id })
    .from(aiVideoProjects)
    .where(and(eq(aiVideoProjects.id, projectId), eq(aiVideoProjects.userId, userId)))
    .limit(1)
  if (!row) {
    throw new Error("Project not found")
  }
}

async function getOwnedFirstFrameWithMedia(userId: string, firstFrameId: string) {
  const [row] = await db
    .select({ firstFrame: aiVideoFirstFrames, media: aiVideoMedia })
    .from(aiVideoFirstFrames)
    .leftJoin(
      aiVideoMedia,
      and(
        eq(aiVideoFirstFrames.generatedMediaId, aiVideoMedia.id),
        eq(aiVideoMedia.userId, userId)
      )
    )
    .where(
      and(
        eq(aiVideoFirstFrames.id, firstFrameId),
        eq(aiVideoFirstFrames.userId, userId)
      )
    )
    .limit(1)
  if (!row) {
    throw new Error("First frame not found")
  }
  return row
}

async function getGenerationJoin(userId: string, generationId: string) {
  const [row] = await db
    .select({ generation: aiVideoGenerations, media: aiVideoMedia })
    .from(aiVideoGenerations)
    .leftJoin(
      aiVideoMedia,
      and(
        eq(aiVideoGenerations.mediaId, aiVideoMedia.id),
        eq(aiVideoMedia.userId, userId)
      )
    )
    .where(
      and(
        eq(aiVideoGenerations.id, generationId),
        eq(aiVideoGenerations.userId, userId)
      )
    )
    .limit(1)
  return row ?? null
}

async function getActiveGenerationJoin(userId: string, projectId: string) {
  const [row] = await db
    .select({ generation: aiVideoGenerations, media: aiVideoMedia })
    .from(aiVideoGenerations)
    .leftJoin(
      aiVideoMedia,
      and(
        eq(aiVideoGenerations.mediaId, aiVideoMedia.id),
        eq(aiVideoMedia.userId, userId)
      )
    )
    .where(
      and(
        eq(aiVideoGenerations.userId, userId),
        eq(aiVideoGenerations.projectId, projectId),
        inArray(aiVideoGenerations.status, [...AI_VIDEO_ACTIVE_STATUSES])
      )
    )
    .orderBy(desc(aiVideoGenerations.updatedAt))
    .limit(1)
  return row ?? null
}

async function getGenerationProcessInput(generationId: string) {
  const [row] = await db
    .select({
      generation: aiVideoGenerations,
      firstFrame: aiVideoFirstFrames,
      media: aiVideoMedia,
    })
    .from(aiVideoGenerations)
    .innerJoin(
      aiVideoFirstFrames,
      eq(aiVideoGenerations.firstFrameId, aiVideoFirstFrames.id)
    )
    .leftJoin(
      aiVideoMedia,
      and(
        eq(aiVideoGenerations.firstFrameMediaId, aiVideoMedia.id),
        eq(aiVideoMedia.userId, aiVideoGenerations.userId)
      )
    )
    .where(eq(aiVideoGenerations.id, generationId))
    .limit(1)
  return row ?? null
}

function serializeGeneration(
  row: AiVideoGeneration,
  media: AiVideoMedia | null
): AiVideoGenerationItem {
  return {
    id: row.id,
    project_id: row.projectId,
    first_frame_id: row.firstFrameId,
    first_frame_media_id: row.firstFrameMediaId,
    prompt: row.prompt,
    model: row.model,
    aspect_ratio: row.aspectRatio as AiVideoAspectRatio,
    duration_seconds: row.durationSeconds as AiVideoDurationSeconds,
    resolution: row.resolution,
    status: row.status as AiVideoGenerationStatus,
    requested_playhead_ms: row.requestedPlayheadMs,
    media: media ? serializeMedia(media) : null,
    error_message: row.errorMessage,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  }
}

function cleanAiVideoPrompt(value: string) {
  const prompt = value.trim()
  if (!prompt) {
    throw new Error("AI video prompt is required")
  }
  return prompt.slice(0, 2000)
}

function composeVeoPrompt(prompt: string) {
  return `${prompt}

Use the provided image as the exact first frame. Create a silent visual-only clip with no dialogue, no music, no captions, and no on-screen text.`
}

function isAiVideoAspectRatio(value: string): value is AiVideoAspectRatio {
  return (AI_VIDEO_ASPECT_RATIOS as readonly string[]).includes(value)
}
