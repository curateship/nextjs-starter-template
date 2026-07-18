import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import type {
  AiVideoDurationSeconds,
  AiVideoGenerationItem,
  AiVideoGenerationListItem,
  AiVideoGenerationListResponse,
} from "@/server/ai-video-generations"

export type {
  AiVideoDurationSeconds,
  AiVideoGenerationItem,
  AiVideoGenerationListItem,
  AiVideoGenerationListResponse,
}

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

const insertGenerationSchema = generationIdSchema.extend({
  projectId: z.string().min(1).max(36),
})

const bulkDeleteGenerationsSchema = z.object({
  generationIds: z.array(z.string().min(1).max(36)).min(1).max(100),
})

const safeErrorMessages = new Set([
  "API usage limit reached. Try again next month.",
  "AI video generation is not configured",
  "AI video generation failed",
  "AI video generation not found",
  "AI video generation was not created",
  "AI video prompt is required",
  "First frame aspect is not supported for AI Video",
  "First frame image is missing",
  "First frame media must be an image",
  "First frame not found",
  "Only failed generations can be retried",
  "Only ready generations can be inserted",
  "Project not found",
  "Project timeline is full",
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

const listAiVideoGenerationsFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<AiVideoGenerationListResponse> => {
    const { listAiVideoGenerationsForCurrentUser } = await import(
      "@/server/ai-video-generations"
    )
    return listAiVideoGenerationsForCurrentUser()
  }
)

const retryAiVideoGenerationFn = createServerFn({ method: "POST" })
  .inputValidator(generationIdSchema)
  .handler(async ({ data }): Promise<AiVideoGenerationListItem> => {
    const { retryAiVideoGenerationForCurrentUser } = await import(
      "@/server/ai-video-generations"
    )
    return retryAiVideoGenerationForCurrentUser(data.generationId)
  })

const insertAiVideoGenerationFn = createServerFn({ method: "POST" })
  .inputValidator(insertGenerationSchema)
  .handler(
    async ({ data }): Promise<{ project_id: string; project_name: string }> => {
      const { insertAiVideoGenerationIntoProjectForCurrentUser } = await import(
        "@/server/ai-video-generations"
      )
      return insertAiVideoGenerationIntoProjectForCurrentUser(
        data.generationId,
        data.projectId
      )
    }
  )

const deleteAiVideoGenerationFn = createServerFn({ method: "POST" })
  .inputValidator(generationIdSchema)
  .handler(async ({ data }): Promise<{ generationId: string }> => {
    const { deleteAiVideoGenerationForCurrentUser } = await import(
      "@/server/ai-video-generations"
    )
    return deleteAiVideoGenerationForCurrentUser(data.generationId)
  })

const bulkDeleteAiVideoGenerationsFn = createServerFn({ method: "POST" })
  .inputValidator(bulkDeleteGenerationsSchema)
  .handler(async ({ data }): Promise<{ deletedCount: number }> => {
    const { deleteAiVideoGenerationsForCurrentUser } = await import(
      "@/server/ai-video-generations"
    )
    return deleteAiVideoGenerationsForCurrentUser(data.generationIds)
  })

export function listAiVideoGenerations() {
  return listAiVideoGenerationsFn()
}

export function retryAiVideoGeneration(generationId: string) {
  return retryAiVideoGenerationFn({ data: { generationId } })
}

export function insertAiVideoGeneration(
  generationId: string,
  projectId: string
) {
  return insertAiVideoGenerationFn({ data: { generationId, projectId } })
}

export function deleteAiVideoGeneration(generationId: string) {
  return deleteAiVideoGenerationFn({ data: { generationId } })
}

export function bulkDeleteAiVideoGenerations(generationIds: string[]) {
  return bulkDeleteAiVideoGenerationsFn({ data: { generationIds } })
}

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
