import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import {
  ACTOR_MODEL,
  type ActorPayload,
  type ActorStatus,
} from "@/lib/actor-models"
import type { ActorItem, ActorListResponse } from "@/server/actors"

export { ACTOR_MODEL }
export type { ActorItem, ActorListResponse, ActorPayload, ActorStatus }

const actorPayloadSchema = z.object({
  name: z.string().min(1).max(255),
  prompt: z.string().min(1).max(5000),
  status: z.enum(["active", "inactive"]),
  tags: z.string().max(1000),
  model: z.literal(ACTOR_MODEL),
  referenceMediaId: z.string().min(1).max(36).nullable().optional(),
})

const actorUpdateSchema = actorPayloadSchema.extend({
  actorId: z.string().min(1).max(36),
})

const actorIdSchema = z.object({
  actorId: z.string().min(1).max(36),
})

const actorSafeErrorMessages = new Set([
  "Actor image generation limit reached. Try again later.",
  "Actor image storage is not configured",
  "Actor image upload failed",
  "Actor name is required",
  "Image generation failed",
  "Image generation did not return an image",
  "Image generation is not configured",
  "Image generation returned an empty image",
  "Image generation returned an image that is too large",
  "Image generation returned an invalid file type",
  "Prompt is required",
  "Reference media must be an image",
  "Unsupported actor model",
])

export function getActorErrorMessage(error: unknown) {
  if (!(error instanceof Error)) return "Actor request failed."
  if (actorSafeErrorMessages.has(error.message)) return error.message
  return "Actor request failed."
}

const listActorsFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<ActorListResponse> => {
    const { listActorsForCurrentUser } = await import(
      "@/server/actor-actions"
    )
    return listActorsForCurrentUser()
  }
)

const createActorFn = createServerFn({ method: "POST" })
  .inputValidator(actorPayloadSchema)
  .handler(async ({ data }): Promise<ActorItem> => {
    const { createActorForCurrentUser } = await import(
      "@/server/actor-actions"
    )
    return createActorForCurrentUser(data)
  })

const updateActorFn = createServerFn({ method: "POST" })
  .inputValidator(actorUpdateSchema)
  .handler(async ({ data }): Promise<ActorItem> => {
    const { updateActorForCurrentUser } = await import(
      "@/server/actor-actions"
    )
    return updateActorForCurrentUser(data.actorId, data)
  })

const regenerateActorFn = createServerFn({ method: "POST" })
  .inputValidator(actorUpdateSchema)
  .handler(async ({ data }): Promise<ActorItem> => {
    const { regenerateActorForCurrentUser } = await import(
      "@/server/actor-actions"
    )
    return regenerateActorForCurrentUser(data.actorId, data)
  })

const deleteActorFn = createServerFn({ method: "POST" })
  .inputValidator(actorIdSchema)
  .handler(async ({ data }): Promise<{ actorId: string }> => {
    const { deleteActorForCurrentUser } = await import(
      "@/server/actor-actions"
    )
    return deleteActorForCurrentUser(data.actorId)
  })

export function listActors() {
  return listActorsFn()
}

export function createActor(payload: ActorPayload) {
  return createActorFn({ data: payload })
}

export function updateActor(actorId: string, payload: ActorPayload) {
  return updateActorFn({ data: { actorId, ...payload } })
}

export function regenerateActor(actorId: string, payload: ActorPayload) {
  return regenerateActorFn({ data: { actorId, ...payload } })
}

export function deleteActor(actorId: string) {
  return deleteActorFn({ data: { actorId } })
}
