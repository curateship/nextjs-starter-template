import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { isProjectSpendLimitMessage } from "@/lib/video/project-spend"
import { describeAuthError } from "@/lib/api/error-message"
import {
  ACTOR_IMAGE_MODEL_IDS,
  ACTOR_IMAGE_MODELS,
  DEFAULT_IMAGE_MODEL,
  MAIN_PICTURE_REMOVE_MESSAGE,
  MAX_SHEET_LABEL_LENGTH,
  SHEET_DUPLICATE_MESSAGE,
  SHEET_FULL_MESSAGE,
  SHEET_PICTURE_NOT_FOUND_MESSAGE,
} from "@/lib/video/asset-factories"
import { userGet, userPost } from "@/server/guards"
import type {
  ActorItem,
  ActorPayload,
  ActorSheetPicture,
} from "@/server/video/asset-factories/actors"

export { ACTOR_IMAGE_MODELS as IMAGE_MODELS, DEFAULT_IMAGE_MODEL }
export type { ActorItem, ActorPayload, ActorSheetPicture }

const payloadSchema = z.object({
  name: z.string().trim().min(1).max(200),
  prompt: z.string().trim().min(1).max(5000),
  model: z.enum(ACTOR_IMAGE_MODEL_IDS),
  status: z.enum(["active", "inactive"]),
  tags: z.string().max(1000),
  referenceMediaId: z.string().min(1).max(36).nullable().optional(),
  referenceMediaUrl: z.string().url().max(2048).nullable().optional(),
  lookProjectId: z.string().min(1).max(36).nullable().optional(),
})
const idSchema = z.object({ actorId: z.string().min(1).max(36) })
const updateSchema = idSchema.extend(payloadSchema.shape)
const idsSchema = z.object({
  actorIds: z.array(z.string().min(1).max(36)).min(1).max(100),
})
const labelSchema = z.string().max(MAX_SHEET_LABEL_LENGTH).nullable()
const pictureIdSchema = z.object({ pictureId: z.string().min(1).max(36) })

export function getActorErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : ""
  if (message.startsWith("Google ") || message.startsWith("OpenAI ")) return message
  if (isProjectSpendLimitMessage(message)) return message
  if (
    [
      "Actor not found",
      "Project not found",
      "Actor name is required",
      "Prompt is required",
      "Reference media must be an image",
      "Add a Google Gemini key in Settings first",
      "Add an OpenAI key in Settings first",
      "Wait for this actor's video generation to finish",
      "Media not found",
      MAIN_PICTURE_REMOVE_MESSAGE,
      SHEET_PICTURE_NOT_FOUND_MESSAGE,
      SHEET_DUPLICATE_MESSAGE,
      SHEET_FULL_MESSAGE,
    ].includes(message)
  ) return message
  if (message.includes("AI_LIMIT_REACHED")) return "Your monthly AI allowance is used up."
  return describeAuthError(message) ?? "Actor request failed."
}

const listFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(({ context }) => import("@/server/video/asset-factories/actors").then((m) => m.listActors(context.user.id)))

const createFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(payloadSchema)
  .handler(({ data, context }) => import("@/server/video/asset-factories/actors").then((m) => m.createActor(context.user.id, data)))

const updateFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(updateSchema.extend({ regenerate: z.boolean() }))
  .handler(({ data, context }) => import("@/server/video/asset-factories/actors").then((m) => m.updateActor(context.user.id, data.actorId, data, data.regenerate)))

const deleteFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(idsSchema)
  .handler(({ data, context }) => import("@/server/video/asset-factories/actors").then((m) => m.deleteActors(context.user.id, data.actorIds)))

export function listActors() { return listFn() }
export function createActor(payload: ActorPayload) { return createFn({ data: payload }) }
export function updateActor(actorId: string, payload: ActorPayload, regenerate = false) {
  return updateFn({ data: { actorId, ...payload, regenerate } })
}
export function deleteActors(actorIds: string[]) { return deleteFn({ data: { actorIds } }) }

const addPictureFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(idSchema.extend({ mediaUrl: z.string().url().max(2048), label: labelSchema }))
  .handler(({ data, context }) => import("@/server/video/asset-factories/actors").then((m) => m.addSheetPicture(context.user.id, data.actorId, data)))

const labelPictureFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(pictureIdSchema.extend({ label: labelSchema }))
  .handler(({ data, context }) => import("@/server/video/asset-factories/actors").then((m) => m.labelSheetPicture(context.user.id, data.pictureId, data.label)))

const mainPictureFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(pictureIdSchema)
  .handler(({ data, context }) => import("@/server/video/asset-factories/actors").then((m) => m.makeMainSheetPicture(context.user.id, data.pictureId)))

const removePictureFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(pictureIdSchema)
  .handler(({ data, context }) => import("@/server/video/asset-factories/actors").then((m) => m.removeSheetPicture(context.user.id, data.pictureId)))

/** Each returns the actor with its sheet as it now stands. */
export function addSheetPicture(actorId: string, mediaUrl: string, label: string | null = null) {
  return addPictureFn({ data: { actorId, mediaUrl, label } })
}
export function labelSheetPicture(pictureId: string, label: string | null) {
  return labelPictureFn({ data: { pictureId, label } })
}
export function makeMainSheetPicture(pictureId: string) { return mainPictureFn({ data: { pictureId } }) }
export function removeSheetPicture(pictureId: string) { return removePictureFn({ data: { pictureId } }) }
