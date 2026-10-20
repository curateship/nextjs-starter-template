import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { describeAuthError } from "@/lib/api/error-message"
import {
  isShotAllowanceShortMessage,
  PERSON_SHOTS_FULL_MESSAGE,
  PROJECT_SHOTS_FULL_MESSAGE,
  SHOT_LENGTHS,
  VIDEO_QUALITY_IDS,
  type ShotLengthSeconds,
  type VideoQuality,
} from "@/lib/video/asset-factories"
import {
  MOVING_STILL_BUSY_MESSAGE,
  MOVING_STILL_NOT_FOUND_MESSAGE,
  MOVING_STILL_NOT_FULL_FRAME_MESSAGE,
  MOVING_STILL_TOO_LONG_MESSAGE,
  MOVING_STILL_UNREADABLE_MESSAGE,
} from "@/lib/video/moving-still"
import { PROJECT_NOT_FOUND_MESSAGE } from "@/lib/video/projects"
import {
  REMAKE_ACTOR_GONE_MESSAGE,
  REMAKE_BUSY_MESSAGE,
  REMAKE_NOT_FOUND_MESSAGE,
  REMAKE_START_GONE_MESSAGE,
} from "@/lib/video/remake-clip"
import { isProjectSpendLimitMessage } from "@/lib/video/project-spend"
import { userGet, userPost } from "@/server/guards"
import type { GenerationItem } from "@/server/video/asset-factories/generations"

export { SHOT_LENGTHS }
export type { GenerationItem }

// A shot's id, which is its first piece's id.
const idSchema = z.object({ generationId: z.string().min(1).max(36) })

export function getGenerationErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : ""
  if (message.startsWith("Google ")) return message
  if (isProjectSpendLimitMessage(message)) return message
  if (isShotAllowanceShortMessage(message)) return message
  if (
    [
      PROJECT_NOT_FOUND_MESSAGE,
      "AI video generation not found",
      "Only failed generations can be retried",
      "First frame not found",
      "First frame is not an image",
      PROJECT_SHOTS_FULL_MESSAGE,
      PERSON_SHOTS_FULL_MESSAGE,
      "Write one direction for each piece of the shot",
      "A video that is still generating cannot be deleted",
      "Add a Google Gemini key in Settings first",
      MOVING_STILL_BUSY_MESSAGE,
      MOVING_STILL_NOT_FOUND_MESSAGE,
      MOVING_STILL_NOT_FULL_FRAME_MESSAGE,
      MOVING_STILL_TOO_LONG_MESSAGE,
      MOVING_STILL_UNREADABLE_MESSAGE,
      REMAKE_BUSY_MESSAGE,
      REMAKE_NOT_FOUND_MESSAGE,
      REMAKE_START_GONE_MESSAGE,
      REMAKE_ACTOR_GONE_MESSAGE,
      "Pick a length at least as long as the picture",
      "This shot is not ready to land",
    ].includes(message)
  ) return message
  if (message.includes("AI_LIMIT_REACHED")) return "Your monthly AI allowance is used up."
  return describeAuthError(message) ?? "AI video request failed."
}

const listFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object({ projectId: z.string().min(1).max(36) }))
  .handler(({ data, context }) => import("@/server/video/asset-factories/generations").then((m) => m.listGenerations(context.user.id, data.projectId)))

const createFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({
    projectId: z.string().min(1).max(36),
    firstFrameId: z.string().min(1).max(36),
    prompts: z.array(z.string().trim().min(1).max(5000)).min(1).max(4),
    lengthSeconds: z.union(SHOT_LENGTHS.map((value) => z.literal(value)) as [z.ZodLiteral<ShotLengthSeconds>, ...z.ZodLiteral<ShotLengthSeconds>[]]),
    quality: z.enum(VIDEO_QUALITY_IDS),
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

/** This project's shots, newest first. */
export function listGenerations(projectId: string) { return listFn({ data: { projectId } }) }
export function createGeneration(data: { projectId: string; firstFrameId: string; prompts: string[]; lengthSeconds: ShotLengthSeconds; quality: VideoQuality }) { return createFn({ data }) }
export function retryGeneration(generationId: string) { return retryFn({ data: { generationId } }) }
export function deleteGenerations(generationIds: string[]) { return deleteFn({ data: { generationIds } }) }

const createStillFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({
    projectId: z.string().min(1).max(36),
    clipId: z.string().min(1).max(64),
    prompts: z.array(z.string().trim().min(1).max(5000)).min(1).max(4),
    lengthSeconds: z.union(SHOT_LENGTHS.map((value) => z.literal(value)) as [z.ZodLiteral<ShotLengthSeconds>, ...z.ZodLiteral<ShotLengthSeconds>[]]),
    quality: z.enum(VIDEO_QUALITY_IDS),
  }))
  .handler(({ data, context }) => import("@/server/video/asset-factories/moving-stills").then((m) => m.createStillShot(context.user.id, data)))

const listStillFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object({ projectId: z.string().min(1).max(36) }))
  .handler(({ data, context }) => import("@/server/video/asset-factories/moving-stills").then((m) => m.listStillShots(context.user.id, data.projectId)))

const settleStillFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(idSchema.extend({ outcome: z.enum(["replaced", "gone"]) }))
  .handler(({ data, context }) => import("@/server/video/asset-factories/moving-stills").then((m) => m.settleStillShot(context.user.id, data.generationId, data.outcome)))

/** Asks for a moving shot of a picture, or of a moving clip made again, which takes that clip's place when it arrives. */
export function createStillShot(data: { projectId: string; clipId: string; prompts: string[]; lengthSeconds: ShotLengthSeconds; quality: VideoQuality }) { return createStillFn({ data }) }
/** This project's shots for timeline clips that have not landed yet. */
export function listStillShots(projectId: string) { return listStillFn({ data: { projectId } }) }
/** Records that this editor landed a finished shot. `settled` is false when the worker already had. */
export function settleStillShot(generationId: string, outcome: "replaced" | "gone") { return settleStillFn({ data: { generationId, outcome } }) }
