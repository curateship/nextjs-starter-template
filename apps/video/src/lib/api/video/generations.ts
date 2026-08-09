import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { describeAuthError } from "@/lib/api/error-message"
import { VIDEO_DURATIONS } from "@/lib/video/asset-factories"
import { userGet, userPost } from "@/server/guards"
import type { GenerationItem } from "@/server/video/asset-factories/generations"

export { VIDEO_DURATIONS }
export type { GenerationItem }

const idSchema = z.object({ generationId: z.string().min(1).max(36) })

export function getGenerationErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : ""
  if (message.startsWith("Google ")) return message
  if (
    [
      "AI video generation not found",
      "Only failed generations can be retried",
      "Only ready generations can be inserted",
      "Project not found",
      "First frame not found",
      "First frame is not an image",
      "Project timeline is full",
      "This project already has a video generating",
      "A video that is still generating cannot be deleted",
      "Add a Google Gemini key in Settings first",
    ].includes(message)
  ) return message
  if (message.includes("AI_LIMIT_REACHED")) return "Your monthly AI allowance is used up."
  return describeAuthError(message) ?? "AI video request failed."
}

const listFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(({ context }) => import("@/server/video/asset-factories/generations").then((m) => m.listGenerations(context.user.id)))

const createFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({
    projectId: z.string().min(1).max(36),
    firstFrameId: z.string().min(1).max(36),
    prompt: z.string().trim().min(1).max(5000),
    durationSeconds: z.union(VIDEO_DURATIONS.map((value) => z.literal(value)) as [z.ZodLiteral<4>, z.ZodLiteral<6>, z.ZodLiteral<8>]),
  }))
  .handler(({ data, context }) => import("@/server/video/asset-factories/generations").then((m) => m.createGeneration(context.user.id, data)))

const retryFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(idSchema)
  .handler(({ data, context }) => import("@/server/video/asset-factories/generations").then((m) => m.retryGeneration(context.user.id, data.generationId)))

const deleteFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ generationIds: z.array(z.string().min(1).max(36)).min(1).max(100) }))
  .handler(({ data, context }) => import("@/server/video/asset-factories/generations").then((m) => m.deleteGenerations(context.user.id, data.generationIds)))

const insertFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(idSchema.extend({ projectId: z.string().min(1).max(36) }))
  .handler(({ data, context }) => import("@/server/video/asset-factories/generations").then((m) => m.insertGeneration(context.user.id, data.generationId, data.projectId)))

export function listGenerations() { return listFn() }
export function createGeneration(data: { projectId: string; firstFrameId: string; prompt: string; durationSeconds: 4 | 6 | 8 }) { return createFn({ data }) }
export function retryGeneration(generationId: string) { return retryFn({ data: { generationId } }) }
export function deleteGenerations(generationIds: string[]) { return deleteFn({ data: { generationIds } }) }
export function insertGeneration(generationId: string, projectId: string) { return insertFn({ data: { generationId, projectId } }) }
