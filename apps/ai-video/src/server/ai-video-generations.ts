import { and, desc, eq, inArray } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"

import type { MediaItem } from "@/server/media"
import { requireCanonicalTimeline } from "@/lib/timeline-schema"
import { withApiUsage } from "@/server/api-usage"
import { db } from "@/server/db"
import { readResponseBytesWithLimit } from "@/server/download-limits"
import { getLlmKey } from "@/server/llm-keys"
import {
  saveGeneratedVideoToProjectMedia,
  serializeMedia,
} from "@/server/media"
import { bodyToBytes, getFromR2 } from "@/server/media-storage"
import { mediaFileUrl } from "@/server/media-urls"
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
import { writeProjectTimeline } from "@/server/video-projects"

// Two joins onto the media table in one query (the generated clip and the
// generation's first-frame image) need distinct aliases.
const generatedMedia = alias(aiVideoMedia, "generation_generated_media")
const firstFrameMedia = alias(aiVideoMedia, "generation_first_frame_media")

const AI_VIDEO_MAX_TIMELINE_TRACKS = 50

const AI_VIDEO_MODEL = "veo-3.1-generate-preview"
const AI_VIDEO_RESOLUTION = "720p"
const AI_VIDEO_POLL_INTERVAL_MS = 10_000
const AI_VIDEO_TIMEOUT_MS = 8 * 60 * 1000
const AI_VIDEO_MAX_DOWNLOAD_BYTES = 500 * 1024 * 1024
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

// Gallery row: the generation plus the context the cross-project history needs
// — which project it belongs to and the first-frame image used as its poster.
export type AiVideoGenerationListItem = AiVideoGenerationItem & {
  project_name: string
  first_frame_image_url: string | null
}

export type AiVideoGenerationListResponse = {
  generations: AiVideoGenerationListItem[]
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
  const activeGeneration = await getActiveGenerationJoin(
    user.id,
    data.projectId
  )
  if (activeGeneration) {
    return serializeGeneration(
      activeGeneration.generation,
      activeGeneration.media
    )
  }

  const apiKey = await getLlmKey("gemini")
  if (!apiKey) {
    throw new Error("AI video generation is not configured")
  }

  const createdAt = now()
  const object = await getFromR2(joined.media.storagePath)
  const imageBytes = await bodyToBytes(object.Body)
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

  try {
    const operationName = await startVeoOperation({
      userId: user.id,
      apiKey,
      prompt: composeVeoPrompt(prompt),
      imageBytes,
      imageMimeType: joined.media.mimeType,
      aspectRatio,
      durationSeconds: data.durationSeconds,
    })
    const [processing] = await db
      .update(aiVideoGenerations)
      .set({
        status: "processing",
        operationName,
        updatedAt: now(),
      })
      .where(eq(aiVideoGenerations.id, created.id))
      .returning()

    if (!processing) {
      throw new Error("AI video generation was not updated")
    }

    void processAiVideoGeneration(processing.id, apiKey).catch((error) => {
      console.error("AI video generation crashed", processing.id, error)
    })

    return serializeGeneration(processing, null)
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "API usage limit reached. Try again next month."
    ) {
      await db
        .delete(aiVideoGenerations)
        .where(eq(aiVideoGenerations.id, created.id))
    } else {
      await db
        .update(aiVideoGenerations)
        .set({
          status: "error",
          errorMessage: "AI video generation failed",
          updatedAt: now(),
        })
        .where(eq(aiVideoGenerations.id, created.id))
    }
    throw error
  }
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

export async function listAiVideoGenerationsForCurrentUser(): Promise<AiVideoGenerationListResponse> {
  const user = await requireUser()
  const rows = await getGenerationListRows(user.id)
  return {
    generations: rows.map((row) =>
      serializeGenerationListItem(
        row.generation,
        row.media,
        row.firstFrameMedia,
        row.projectName
      )
    ),
  }
}

// Re-run a failed generation in place: the same row transitions
// error → processing → ready, so the history keeps one entry per attempt
// instead of piling up abandoned rows. Reuses the stored first frame + prompt.
export async function retryAiVideoGenerationForCurrentUser(
  generationId: string
): Promise<AiVideoGenerationListItem> {
  requireAppOrigin()
  const user = await requireUser()
  const existing = await getGenerationJoin(user.id, generationId)
  if (!existing) {
    throw new Error("AI video generation not found")
  }
  if (existing.generation.status !== "error") {
    throw new Error("Only failed generations can be retried")
  }

  const frame = await getGenerationProcessInput(generationId)
  if (!frame?.media) {
    throw new Error("First frame image is missing")
  }
  if (frame.media.fileType !== "image") {
    throw new Error("First frame media must be an image")
  }
  const aspectRatio = existing.generation.aspectRatio
  if (!isAiVideoAspectRatio(aspectRatio)) {
    throw new Error("First frame aspect is not supported for AI Video")
  }
  const durationSeconds = existing.generation
    .durationSeconds as AiVideoDurationSeconds

  const apiKey = await getLlmKey("gemini")
  if (!apiKey) {
    throw new Error("AI video generation is not configured")
  }

  // Atomically claim the retry: only an 'error' row flips to 'queued'. A second
  // concurrent retry (double-click, two tabs) finds no error row and aborts, so
  // Veo never runs twice for one generation.
  const [claimed] = await db
    .update(aiVideoGenerations)
    .set({
      status: "queued",
      operationName: null,
      mediaId: null,
      errorMessage: null,
      updatedAt: now(),
    })
    .where(
      and(
        eq(aiVideoGenerations.id, generationId),
        eq(aiVideoGenerations.userId, user.id),
        eq(aiVideoGenerations.status, "error")
      )
    )
    .returning({ id: aiVideoGenerations.id })
  if (!claimed) {
    throw new Error("Only failed generations can be retried")
  }

  try {
    // Fetch the first-frame bytes inside the try: if R2 is unreachable the
    // catch resets the row to 'error' so it stays retryable, rather than
    // stranding it at 'queued' forever.
    const object = await getFromR2(frame.media.storagePath)
    const imageBytes = await bodyToBytes(object.Body)
    const operationName = await startVeoOperation({
      userId: user.id,
      apiKey,
      prompt: composeVeoPrompt(existing.generation.prompt),
      imageBytes,
      imageMimeType: frame.media.mimeType,
      aspectRatio,
      durationSeconds,
    })
    await db
      .update(aiVideoGenerations)
      .set({ status: "processing", operationName, updatedAt: now() })
      .where(eq(aiVideoGenerations.id, generationId))

    void processAiVideoGeneration(generationId, apiKey).catch((error) => {
      console.error("AI video generation crashed", generationId, error)
    })
  } catch (error) {
    await db
      .update(aiVideoGenerations)
      .set({
        status: "error",
        errorMessage: "AI video generation failed",
        updatedAt: now(),
      })
      .where(eq(aiVideoGenerations.id, generationId))
    throw error
  }

  return requireGenerationListItem(user.id, generationId)
}

// Append a ready generation's clip onto a fresh track at the end of the target
// project's timeline. A new track avoids overlap math; the user arranges it in
// the editor. Media is user-scoped, so a clip from one project plays and
// renders in another.
export async function insertAiVideoGenerationIntoProjectForCurrentUser(
  generationId: string,
  targetProjectId: string
): Promise<{ project_id: string; project_name: string }> {
  requireAppOrigin()
  const user = await requireUser()
  const joined = await getGenerationJoin(user.id, generationId)
  if (!joined) {
    throw new Error("AI video generation not found")
  }
  if (joined.generation.status !== "ready" || !joined.media) {
    throw new Error("Only ready generations can be inserted")
  }

  const [project] = await db
    .select()
    .from(aiVideoProjects)
    .where(
      and(
        eq(aiVideoProjects.id, targetProjectId),
        eq(aiVideoProjects.userId, user.id)
      )
    )
    .limit(1)
  if (!project) {
    throw new Error("Project not found")
  }

  const timeline = requireCanonicalTimeline(project.timeline)
  if (timeline.tracks.length >= AI_VIDEO_MAX_TIMELINE_TRACKS) {
    throw new Error("Project timeline is full")
  }

  const mediaItem = serializeMedia(joined.media)
  const durationMs = joined.generation.durationSeconds * 1000
  const nextTimeline = requireCanonicalTimeline({
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
            name: mediaItem.original_name.slice(0, 255),
            startMs: 0,
            durationMs,
            trimStartMs: 0,
            mediaId: mediaItem.id,
            url: mediaItem.proxy_url ?? mediaItem.url,
            muted: true,
            sourceDurationMs: durationMs,
          },
        ],
      },
    ],
  })

  // Same compare-and-swap save path the editor uses: the append is based on
  // the timeline read above, so it must not land if the project moved on.
  // Bumping the version also makes an editor open on this project notice.
  await writeProjectTimeline(user.id, project.id, nextTimeline, project.version)

  return { project_id: project.id, project_name: project.name }
}

export async function deleteAiVideoGenerationForCurrentUser(
  generationId: string
): Promise<{ generationId: string }> {
  requireAppOrigin()
  const user = await requireUser()
  const [row] = await db
    .delete(aiVideoGenerations)
    .where(
      and(
        eq(aiVideoGenerations.id, generationId),
        eq(aiVideoGenerations.userId, user.id)
      )
    )
    .returning({ id: aiVideoGenerations.id })

  if (!row) {
    throw new Error("AI video generation not found")
  }

  return { generationId: row.id }
}

export async function deleteAiVideoGenerationsForCurrentUser(
  generationIds: string[]
): Promise<{ deletedCount: number }> {
  requireAppOrigin()
  const user = await requireUser()
  const uniqueIds = Array.from(new Set(generationIds))
  if (!uniqueIds.length) return { deletedCount: 0 }

  const rows = await db
    .delete(aiVideoGenerations)
    .where(
      and(
        eq(aiVideoGenerations.userId, user.id),
        inArray(aiVideoGenerations.id, uniqueIds)
      )
    )
    .returning({ id: aiVideoGenerations.id })

  return { deletedCount: rows.length }
}

async function processAiVideoGeneration(generationId: string, apiKey: string) {
  try {
    const joined = await getGenerationProcessInput(generationId)
    if (!joined?.media) {
      throw new Error("First frame image is missing")
    }
    if (!joined.generation.operationName) {
      throw new Error("AI video generation operation is missing")
    }

    const operation = await waitForVeoOperation(
      joined.generation.operationName,
      apiKey
    )
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
  userId,
  apiKey,
  prompt,
  imageBytes,
  imageMimeType,
  aspectRatio,
  durationSeconds,
}: {
  userId: string
  apiKey: string
  prompt: string
  imageBytes: Uint8Array
  imageMimeType: string
  aspectRatio: AiVideoAspectRatio
  durationSeconds: AiVideoDurationSeconds
}) {
  const response = await withApiUsage(
    userId,
    {
      provider: "veo",
      feature: "ai_video_generation",
      model: AI_VIDEO_MODEL,
    },
    async () => {
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
      return response
    }
  )

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
  return readResponseBytesWithLimit(
    response,
    AI_VIDEO_MAX_DOWNLOAD_BYTES,
    "AI video generation returned a video that is too large"
  )
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
    .where(
      and(eq(aiVideoProjects.id, projectId), eq(aiVideoProjects.userId, userId))
    )
    .limit(1)
  if (!row) {
    throw new Error("Project not found")
  }
}

async function getOwnedFirstFrameWithMedia(
  userId: string,
  firstFrameId: string
) {
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

async function getGenerationListRows(userId: string) {
  return db
    .select({
      generation: aiVideoGenerations,
      media: generatedMedia,
      firstFrameMedia,
      projectName: aiVideoProjects.name,
    })
    .from(aiVideoGenerations)
    .innerJoin(
      aiVideoProjects,
      and(
        eq(aiVideoGenerations.projectId, aiVideoProjects.id),
        eq(aiVideoProjects.userId, userId)
      )
    )
    .leftJoin(
      generatedMedia,
      and(
        eq(aiVideoGenerations.mediaId, generatedMedia.id),
        eq(generatedMedia.userId, userId)
      )
    )
    .leftJoin(
      firstFrameMedia,
      and(
        eq(aiVideoGenerations.firstFrameMediaId, firstFrameMedia.id),
        eq(firstFrameMedia.userId, userId)
      )
    )
    .where(eq(aiVideoGenerations.userId, userId))
    .orderBy(desc(aiVideoGenerations.createdAt))
}

async function requireGenerationListItem(
  userId: string,
  generationId: string
): Promise<AiVideoGenerationListItem> {
  const [row] = await db
    .select({
      generation: aiVideoGenerations,
      media: generatedMedia,
      firstFrameMedia,
      projectName: aiVideoProjects.name,
    })
    .from(aiVideoGenerations)
    .innerJoin(
      aiVideoProjects,
      and(
        eq(aiVideoGenerations.projectId, aiVideoProjects.id),
        eq(aiVideoProjects.userId, userId)
      )
    )
    .leftJoin(
      generatedMedia,
      and(
        eq(aiVideoGenerations.mediaId, generatedMedia.id),
        eq(generatedMedia.userId, userId)
      )
    )
    .leftJoin(
      firstFrameMedia,
      and(
        eq(aiVideoGenerations.firstFrameMediaId, firstFrameMedia.id),
        eq(firstFrameMedia.userId, userId)
      )
    )
    .where(
      and(
        eq(aiVideoGenerations.userId, userId),
        eq(aiVideoGenerations.id, generationId)
      )
    )
    .limit(1)
  if (!row) {
    throw new Error("AI video generation not found")
  }
  return serializeGenerationListItem(
    row.generation,
    row.media,
    row.firstFrameMedia,
    row.projectName
  )
}

function serializeGenerationListItem(
  row: AiVideoGeneration,
  media: AiVideoMedia | null,
  firstFrame: AiVideoMedia | null,
  projectName: string
): AiVideoGenerationListItem {
  return {
    ...serializeGeneration(row, media),
    project_name: projectName,
    first_frame_image_url: firstFrame ? mediaFileUrl(firstFrame.id) : null,
  }
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
