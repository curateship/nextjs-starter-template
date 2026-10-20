import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { describeAuthError } from "@/lib/api/error-message"
import {
  EXTRA_KINDS,
  EXTRA_NOT_FOUND_MESSAGE,
  EXTRA_PICTURE_MISSING_MESSAGE,
  type ExtraPicks,
} from "@/lib/video/extras"
import { PROJECT_NOT_FOUND_MESSAGE } from "@/lib/video/projects"
import { userGet, userPost } from "@/server/guards"
import type {
  ExtraItem,
  ExtraPayload,
} from "@/server/video/asset-factories/extras"

export type { ExtraItem, ExtraPayload }

const extraId = z.string().min(1).max(36)

/** One extra id per kind, every kind optional. */
export const extraPicksSchema = z.object({
  clothing: extraId.optional(),
  backdrop: extraId.optional(),
  prop: extraId.optional(),
  hair: extraId.optional(),
})

const fieldsSchema = z.object({
  name: z.string().trim().min(1).max(200),
  prompt: z.string().trim().min(1).max(5000),
  imageMediaUrl: z.string().url().max(2048).nullable().optional(),
  draw: z.boolean(),
})
const projectIdSchema = z.object({ projectId: z.string().min(1).max(36) })

export function getExtraErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : ""
  if (message.startsWith("Google ")) return message
  if (
    [
      EXTRA_NOT_FOUND_MESSAGE,
      EXTRA_PICTURE_MISSING_MESSAGE,
      PROJECT_NOT_FOUND_MESSAGE,
      "Extra name is required",
      "Prompt is required",
      "Add a Google Gemini key in Settings first",
    ].includes(message)
  ) return message
  if (message.includes("AI_LIMIT_REACHED")) return "Your monthly AI allowance is used up."
  return describeAuthError(message) ?? "Extra request failed."
}

const listFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(({ context }) => import("@/server/video/asset-factories/extras").then((m) => m.listExtras(context.user.id)))

const createFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(fieldsSchema.extend({ kind: z.enum(EXTRA_KINDS) }))
  .handler(({ data, context }) => import("@/server/video/asset-factories/extras").then((m) => m.createExtra(context.user.id, data, data.draw)))

const updateFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(fieldsSchema.extend({ extraId }))
  .handler(({ data, context }) => import("@/server/video/asset-factories/extras").then((m) => m.updateExtra(context.user.id, data.extraId, data, data.draw)))

const deleteFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ extraIds: z.array(extraId).min(1).max(100) }))
  .handler(({ data, context }) => import("@/server/video/asset-factories/extras").then((m) => m.deleteExtras(context.user.id, data.extraIds)))

const readPicksFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(projectIdSchema)
  .handler(({ data, context }) => import("@/server/video/asset-factories/extras").then((m) => m.readProjectExtraPicks(context.user.id, data.projectId)))

const savePicksFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(projectIdSchema.extend({ picks: extraPicksSchema }))
  .handler(({ data, context }) => import("@/server/video/asset-factories/extras").then((m) => m.saveProjectExtraPicks(context.user.id, data.projectId, data.picks)))

export function listExtras() { return listFn() }
/** `draw` makes the picture with AI from the description instead of the one picked. */
export function createExtra(payload: ExtraPayload, draw: boolean) {
  return createFn({ data: { ...payload, draw } })
}
export function updateExtra(extraId: string, payload: Omit<ExtraPayload, "kind">, draw: boolean) {
  return updateFn({ data: { extraId, ...payload, draw } })
}
export function deleteExtras(extraIds: string[]) { return deleteFn({ data: { extraIds } }) }
export function readProjectExtraPicks(projectId: string) { return readPicksFn({ data: { projectId } }) }
export function saveProjectExtraPicks(projectId: string, picks: ExtraPicks) {
  return savePicksFn({ data: { projectId, picks } })
}
