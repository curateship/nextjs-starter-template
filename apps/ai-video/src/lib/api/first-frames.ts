import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import {
  FIRST_FRAME_ASPECT_RATIOS,
  FIRST_FRAME_REFERENCE_SOURCES,
  type FirstFramePayload,
} from "@/lib/first-frame-models"
import {
  ACTOR_MODEL_IDS,
  ACTOR_MODELS,
  DEFAULT_ACTOR_MODEL,
  type ActorModelId,
} from "@/lib/actor-models"
import type {
  FirstFrameItem,
  FirstFrameListResponse,
} from "@/server/first-frames"

export {
  ACTOR_MODELS,
  DEFAULT_ACTOR_MODEL,
  FIRST_FRAME_ASPECT_RATIOS,
  FIRST_FRAME_REFERENCE_SOURCES,
}
export type { ActorModelId, FirstFrameItem, FirstFrameListResponse }
export type {
  FirstFrameAspectRatio,
  FirstFramePayload,
  FirstFrameReferenceSource,
} from "@/lib/first-frame-models"

const firstFramePayloadSchema = z.object({
  name: z.string().min(1).max(255),
  actorId: z.string().min(1).max(36),
  prompt: z.string().min(1).max(5000),
  tags: z.string().max(1000),
  model: z.enum(ACTOR_MODEL_IDS),
  aspectRatio: z.enum(FIRST_FRAME_ASPECT_RATIOS),
  referenceSource: z.enum(FIRST_FRAME_REFERENCE_SOURCES),
  referenceMediaId: z.string().min(1).max(36).nullable().optional(),
})

const firstFrameMetadataPayloadSchema = firstFramePayloadSchema.pick({
  name: true,
  tags: true,
})

const firstFrameIdSchema = z.object({
  firstFrameId: z.string().min(1).max(36),
})

const firstFrameSafeErrorMessages = new Set([
  "API usage limit reached. Try again next month.",
  "Actor not found",
  "First frame name is required",
  "First frame not found",
  "First frame was not created",
  "Image generation failed",
  "Image generation did not return an image",
  "Image generation is not configured",
  "Image generation returned an empty image",
  "Image generation returned an image that is too large",
  "Image generation returned an invalid file type",
  "Media not found",
  "Prompt is required",
  "Reference image is required",
  "Reference media must be an image",
  "Unsupported actor model",
])

export function getFirstFrameErrorMessage(error: unknown) {
  if (!(error instanceof Error)) return "First frame request failed."
  if (firstFrameSafeErrorMessages.has(error.message)) return error.message
  return "First frame request failed."
}

const listFirstFramesFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<FirstFrameListResponse> => {
    const { listFirstFramesForCurrentUser } = await import(
      "@/server/first-frames"
    )
    return listFirstFramesForCurrentUser()
  }
)

const createFirstFrameFn = createServerFn({ method: "POST" })
  .inputValidator(firstFramePayloadSchema)
  .handler(async ({ data }): Promise<FirstFrameItem> => {
    const { createFirstFrameForCurrentUser } = await import(
      "@/server/first-frames"
    )
    return createFirstFrameForCurrentUser(data)
  })

const updateFirstFrameFn = createServerFn({ method: "POST" })
  .inputValidator(firstFrameIdSchema.extend(firstFrameMetadataPayloadSchema.shape))
  .handler(async ({ data }): Promise<FirstFrameItem> => {
    const { updateFirstFrameForCurrentUser } = await import(
      "@/server/first-frames"
    )
    return updateFirstFrameForCurrentUser(data.firstFrameId, data)
  })

const regenerateFirstFrameFn = createServerFn({ method: "POST" })
  .inputValidator(firstFrameIdSchema.extend(firstFramePayloadSchema.shape))
  .handler(async ({ data }): Promise<FirstFrameItem> => {
    const { regenerateFirstFrameForCurrentUser } = await import(
      "@/server/first-frames"
    )
    return regenerateFirstFrameForCurrentUser(data.firstFrameId, data)
  })

const updateFirstFramePinnedFn = createServerFn({ method: "POST" })
  .inputValidator(firstFrameIdSchema.extend({ pinned: z.boolean() }))
  .handler(async ({ data }): Promise<FirstFrameItem> => {
    const { updateFirstFramePinnedForCurrentUser } = await import(
      "@/server/first-frames"
    )
    return updateFirstFramePinnedForCurrentUser(data.firstFrameId, data.pinned)
  })

const deleteFirstFrameFn = createServerFn({ method: "POST" })
  .inputValidator(firstFrameIdSchema)
  .handler(async ({ data }): Promise<{ firstFrameId: string }> => {
    const { deleteFirstFrameForCurrentUser } = await import(
      "@/server/first-frames"
    )
    return deleteFirstFrameForCurrentUser(data.firstFrameId)
  })

const bulkDeleteFirstFramesFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      firstFrameIds: z.array(z.string().min(1).max(36)).min(1).max(100),
    })
  )
  .handler(async ({ data }): Promise<{ deletedCount: number }> => {
    const { deleteFirstFramesForCurrentUser } = await import(
      "@/server/first-frames"
    )
    return deleteFirstFramesForCurrentUser(data.firstFrameIds)
  })

export function listFirstFrames() {
  return listFirstFramesFn()
}

export function createFirstFrame(payload: FirstFramePayload) {
  return createFirstFrameFn({ data: payload })
}

export function updateFirstFrame(
  firstFrameId: string,
  payload: Pick<FirstFramePayload, "name" | "tags">
) {
  return updateFirstFrameFn({ data: { firstFrameId, ...payload } })
}

export function regenerateFirstFrame(
  firstFrameId: string,
  payload: FirstFramePayload
) {
  return regenerateFirstFrameFn({ data: { firstFrameId, ...payload } })
}

export function updateFirstFramePinned(
  firstFrameId: string,
  pinned: boolean
) {
  return updateFirstFramePinnedFn({ data: { firstFrameId, pinned } })
}

export function deleteFirstFrame(firstFrameId: string) {
  return deleteFirstFrameFn({ data: { firstFrameId } })
}

export function bulkDeleteFirstFrames(firstFrameIds: string[]) {
  return bulkDeleteFirstFramesFn({ data: { firstFrameIds } })
}
