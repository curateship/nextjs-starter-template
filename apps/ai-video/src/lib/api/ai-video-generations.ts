import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import type {
  AiVideoDurationSeconds,
  AiVideoGenerationItem,
} from "@/server/ai-video-generations"

export type { AiVideoDurationSeconds, AiVideoGenerationItem }

const createAiVideoGenerationSchema = z.object({
  projectId: z.string().min(1).max(36),
  firstFrameId: z.string().min(1).max(36),
  prompt: z.string().min(1).max(2000),
  durationSeconds: z.union([z.literal(4), z.literal(6), z.literal(8)]),
  requestedPlayheadMs: z.number().finite().min(0),
})

const generationIdSchema = z.object({
  generationId: z.string().min(1).max(36),
})

const projectIdSchema = z.object({
  projectId: z.string().min(1).max(36),
})

const safeErrorMessages = new Set([
  "AI video generation is not configured",
  "AI video generation failed",
  "AI video generation not found",
  "AI video generation was not created",
  "AI video prompt is required",
  "First frame aspect is not supported for AI Video",
  "First frame image is missing",
  "First frame media must be an image",
  "First frame not found",
  "Project not found",
])

export function getAiVideoGenerationErrorMessage(error: unknown) {
  if (!(error instanceof Error)) return "AI video generation request failed."
  if (safeErrorMessages.has(error.message)) return error.message
  return "AI video generation request failed."
}

const createAiVideoGenerationFn = createServerFn({ method: "POST" })
  .inputValidator(createAiVideoGenerationSchema)
  .handler(async ({ data }): Promise<AiVideoGenerationItem> => {
    const { createAiVideoGenerationForCurrentUser } = await import(
      "@/server/ai-video-generations"
    )
    return createAiVideoGenerationForCurrentUser(data)
  })

const getAiVideoGenerationFn = createServerFn({ method: "GET" })
  .inputValidator(generationIdSchema)
  .handler(async ({ data }): Promise<AiVideoGenerationItem> => {
    const { getAiVideoGenerationForCurrentUser } = await import(
      "@/server/ai-video-generations"
    )
    return getAiVideoGenerationForCurrentUser(data.generationId)
  })

const getLatestAiVideoGenerationFn = createServerFn({ method: "GET" })
  .inputValidator(projectIdSchema)
  .handler(async ({ data }): Promise<AiVideoGenerationItem | null> => {
    const { getLatestAiVideoGenerationForCurrentUser } = await import(
      "@/server/ai-video-generations"
    )
    return getLatestAiVideoGenerationForCurrentUser(data.projectId)
  })

export function createAiVideoGeneration(data: {
  projectId: string
  firstFrameId: string
  prompt: string
  durationSeconds: AiVideoDurationSeconds
  requestedPlayheadMs: number
}) {
  return createAiVideoGenerationFn({ data })
}

export function getAiVideoGeneration(generationId: string) {
  return getAiVideoGenerationFn({ data: { generationId } })
}

export function getLatestAiVideoGeneration(projectId: string) {
  return getLatestAiVideoGenerationFn({ data: { projectId } })
}
