import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { describeAuthError } from "@/lib/api/error-message"
import {
  ACTOR_IMAGE_MODEL_IDS,
  ACTOR_IMAGE_MODELS,
  DEFAULT_IMAGE_MODEL,
} from "@/lib/video/asset-factories"
import { userGet, userPost } from "@/server/guards"
import type {
  ActorItem,
  ActorPayload,
} from "@/server/video/asset-factories/actors"

export { ACTOR_IMAGE_MODELS as IMAGE_MODELS, DEFAULT_IMAGE_MODEL }
export type { ActorItem, ActorPayload }

const payloadSchema = z.object({
  name: z.string().trim().min(1).max(200),
  prompt: z.string().trim().min(1).max(5000),
  model: z.enum(ACTOR_IMAGE_MODEL_IDS),
  status: z.enum(["active", "inactive"]),
  tags: z.string().max(1000),
  referenceMediaId: z.string().min(1).max(36).nullable().optional(),
  referenceMediaUrl: z.string().url().max(2048).nullable().optional(),
})
const idSchema = z.object({ actorId: z.string().min(1).max(36) })
const updateSchema = idSchema.extend(payloadSchema.shape)
const idsSchema = z.object({
  actorIds: z.array(z.string().min(1).max(36)).min(1).max(100),
})

export function getActorErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : ""
  if (message.startsWith("Google ") || message.startsWith("OpenAI ")) return message
  if (
    [
      "Actor not found",
      "Actor name is required",
      "Prompt is required",
      "Reference media must be an image",
      "Add a Google Gemini key in Settings first",
      "Add an OpenAI key in Settings first",
      "Wait for this actor's video generation to finish",
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
