import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { describeAuthError } from "@/lib/api/error-message"
import {
  ASSET_ASPECT_RATIOS,
  IMAGE_MODEL_IDS,
  SHEET_PICTURE_NOT_FOUND_MESSAGE,
  type GeminiImageModelId,
} from "@/lib/video/asset-factories"
import {
  BOARD_FULL_MESSAGE,
  EXTRA_NOT_FOUND_MESSAGE,
} from "@/lib/video/extras"
import { extraPicksSchema } from "@/lib/api/video/extras"
import { PROJECT_NOT_FOUND_MESSAGE } from "@/lib/video/projects"
import { REMAKE_NOT_FOUND_MESSAGE } from "@/lib/video/remake-clip"
import { isProjectSpendLimitMessage } from "@/lib/video/project-spend"
import { userGet, userPost } from "@/server/guards"
import type {
  FirstFrameItem,
  FirstFramePayload,
} from "@/server/video/asset-factories/first-frames"

export type { FirstFrameItem, FirstFramePayload }

const projectIdSchema = z.string().min(1).max(36)

const payloadSchema = z.object({
  projectId: projectIdSchema,
  actorId: z.string().min(1).max(36),
  prompt: z.string().trim().min(1).max(5000),
  variants: z.number().int().min(1).max(4),
  sheetPictureIds: z.array(z.string().min(1).max(36)).max(4).nullable().optional(),
  extras: extraPicksSchema.nullable().optional(),
  aspectRatio: z.enum(ASSET_ASPECT_RATIOS).nullable().optional(),
})

export function getFirstFrameErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : ""
  if (message.startsWith("Google ")) return message
  if (isProjectSpendLimitMessage(message)) return message
  if (
    [
      PROJECT_NOT_FOUND_MESSAGE,
      "Actor not found",
      "First frame name is required",
      "Prompt is required",
      "Pick 9:16 or 16:9 for this project's first frames",
      "Add a Google Gemini key in Settings first",
      "Wait for this first frame's video generation to finish",
      SHEET_PICTURE_NOT_FOUND_MESSAGE,
      BOARD_FULL_MESSAGE,
      EXTRA_NOT_FOUND_MESSAGE,
      REMAKE_NOT_FOUND_MESSAGE,
    ].includes(message)
  ) return message
  if (message.includes("AI_LIMIT_REACHED")) return "Your monthly AI allowance is used up."
  return describeAuthError(message) ?? "First frame request failed."
}

const listFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object({ projectId: projectIdSchema }))
  .handler(({ data, context }) => import("@/server/video/asset-factories/first-frames").then((m) => m.listFirstFrames(context.user.id, data.projectId)))

const createFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(payloadSchema)
  .handler(({ data, context }) => import("@/server/video/asset-factories/first-frames").then((m) => m.createFirstFrames(context.user.id, data)))

const remakeFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({
    projectId: projectIdSchema,
    clipId: z.string().min(1).max(64),
    prompt: z.string().trim().min(1).max(5000),
    model: z.enum(IMAGE_MODEL_IDS),
  }))
  .handler(({ data, context }) => import("@/server/video/asset-factories/first-frames").then((m) => m.remakeFirstFrame(context.user.id, data)))

const deleteFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ firstFrameIds: z.array(z.string().min(1).max(36)).min(1).max(100) }))
  .handler(({ data, context }) => import("@/server/video/asset-factories/first-frames").then((m) => m.deleteFirstFrames(context.user.id, data.firstFrameIds)))

/** This project's first frames, newest first. */
export function listFirstFrames(projectId: string) { return listFn({ data: { projectId } }) }
export function createFirstFrames(payload: FirstFramePayload) { return createFn({ data: payload }) }
/** Makes a picture on the timeline again from its first frame's recipe, with new words or a new model. */
export function remakeFirstFrame(data: { projectId: string; clipId: string; prompt: string; model: GeminiImageModelId }) { return remakeFn({ data }) }
export function deleteFirstFrames(firstFrameIds: string[]) { return deleteFn({ data: { firstFrameIds } }) }
