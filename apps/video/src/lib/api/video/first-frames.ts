import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { describeAuthError } from "@/lib/api/error-message"
import {
  ASSET_ASPECT_RATIOS,
  DEFAULT_IMAGE_MODEL,
  IMAGE_MODEL_IDS,
  IMAGE_MODELS,
} from "@/lib/video/asset-factories"
import { userGet, userPost } from "@/server/guards"
import type {
  FirstFrameItem,
  FirstFramePayload,
} from "@/server/video/asset-factories/first-frames"

export { ASSET_ASPECT_RATIOS, DEFAULT_IMAGE_MODEL, IMAGE_MODELS }
export type { FirstFrameItem, FirstFramePayload }

const payloadSchema = z.object({
  name: z.string().trim().min(1).max(200),
  actorId: z.string().min(1).max(36),
  prompt: z.string().trim().min(1).max(5000),
  model: z.enum(IMAGE_MODEL_IDS),
  aspectRatio: z.enum(ASSET_ASPECT_RATIOS),
  tags: z.string().max(1000),
  referenceMediaId: z.string().min(1).max(36).nullable().optional(),
  referenceMediaUrl: z.string().url().max(2048).nullable().optional(),
  variants: z.number().int().min(1).max(4),
})
const idSchema = z.object({ firstFrameId: z.string().min(1).max(36) })

export function getFirstFrameErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : ""
  if (message.startsWith("Google ")) return message
  if (
    [
      "Actor not found",
      "First frame not found",
      "First frame name is required",
      "Prompt is required",
      "Reference media must be an image",
      "Project not found",
      "Project timeline is full",
      "This project changed elsewhere — reload to continue",
      "Add a Google Gemini key in Settings first",
      "Wait for this first frame's video generation to finish",
    ].includes(message)
  ) return message
  if (message.includes("AI_LIMIT_REACHED")) return "Your monthly AI allowance is used up."
  return describeAuthError(message) ?? "First frame request failed."
}

const listFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(({ context }) => import("@/server/video/asset-factories/first-frames").then((m) => m.listFirstFrames(context.user.id)))

const createFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(payloadSchema)
  .handler(({ data, context }) => import("@/server/video/asset-factories/first-frames").then((m) => m.createFirstFrames(context.user.id, data)))

const pinFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(idSchema.extend({ pinned: z.boolean() }))
  .handler(({ data, context }) => import("@/server/video/asset-factories/first-frames").then((m) => m.setFirstFramePinned(context.user.id, data.firstFrameId, data.pinned)))

const deleteFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ firstFrameIds: z.array(z.string().min(1).max(36)).min(1).max(100) }))
  .handler(({ data, context }) => import("@/server/video/asset-factories/first-frames").then((m) => m.deleteFirstFrames(context.user.id, data.firstFrameIds)))

const insertFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(idSchema.extend({ projectId: z.string().min(1).max(36) }))
  .handler(({ data, context }) => import("@/server/video/asset-factories/first-frames").then((m) => m.insertFirstFrame(context.user.id, data.firstFrameId, data.projectId)))

export function listFirstFrames() { return listFn() }
export function createFirstFrames(payload: FirstFramePayload) { return createFn({ data: payload }) }
export function setFirstFramePinned(firstFrameId: string, pinned: boolean) { return pinFn({ data: { firstFrameId, pinned } }) }
export function deleteFirstFrames(firstFrameIds: string[]) { return deleteFn({ data: { firstFrameIds } }) }
export function insertFirstFrame(firstFrameId: string, projectId: string) { return insertFn({ data: { firstFrameId, projectId } }) }
