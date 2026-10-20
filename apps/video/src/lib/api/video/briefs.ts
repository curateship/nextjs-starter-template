import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { getAiToolErrorMessage } from "@/lib/api/video/ai-tools"
import {
  briefRequestSchema,
  sceneDraftSchema,
  BRIEF_SCENES_MAX,
  SAFE_BRIEF_ERRORS,
  type BriefLanding,
  type BriefRequest,
  type SceneDraft,
} from "@/lib/video/brief"
import { userGet, userPost } from "@/server/guards"
import type { BriefItem } from "@/server/video/briefs"

export type { BriefItem }

const idSchema = z.string().min(1).max(36)
const scenesSchema = z
  .array(sceneDraftSchema.extend({ id: idSchema.optional() }))
  .min(1)
  .max(BRIEF_SCENES_MAX)

/** The brief's own refusals as they are, everything else as the AI tools say it. */
export function getBriefErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message.trim() : ""
  if (SAFE_BRIEF_ERRORS.has(message)) return message
  if (message.includes("AI_LIMIT_REACHED")) return "Your monthly AI allowance is used up."
  return getAiToolErrorMessage(error)
}

const writeFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(briefRequestSchema)
  .handler(({ data, context }) =>
    import("@/server/video/briefs").then((m) => m.writeBrief(context.user.id, data))
  )

const listFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object({ projectId: idSchema }))
  .handler(({ data, context }) =>
    import("@/server/video/briefs").then((m) => m.listBriefs(context.user.id, data.projectId))
  )

const saveFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ briefId: idSchema, scenes: scenesSchema }))
  .handler(({ data, context }) =>
    import("@/server/video/briefs").then((m) => m.saveBriefScenes(context.user.id, data))
  )

const startFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.object({
      briefId: idSchema,
      scenes: scenesSchema,
      playheadMs: z.number().finite().min(0),
    })
  )
  .handler(({ data, context }) =>
    import("@/server/video/briefs").then((m) => m.startBrief(context.user.id, data))
  )

const retryFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ briefId: idSchema, sceneId: idSchema }))
  .handler(({ data, context }) =>
    import("@/server/video/briefs").then((m) => m.retryBriefScene(context.user.id, data))
  )

const laneId = z.string().min(1).max(64).optional()
const settleFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.object({
      briefId: idSchema,
      sceneIds: z.array(idSchema).min(1).max(BRIEF_SCENES_MAX),
      lanes: z.object({ words: laneId, pictures: laneId, voice: laneId }).strict(),
    })
  )
  .handler(({ data, context }) =>
    import("@/server/video/briefs").then((m) => m.settleBriefScenes(context.user.id, data))
  )

/** Writes the script from a brief and keeps it as a storyboard. */
export function writeBrief(request: BriefRequest) {
  return writeFn({ data: request })
}
/** This project's briefs, newest first. */
export function listBriefs(projectId: string) {
  return listFn({ data: { projectId } })
}
/** Keeps the storyboard's edits. */
export function saveBriefScenes(briefId: string, scenes: (SceneDraft & { id?: string })[]) {
  return saveFn({ data: { briefId, scenes } })
}
/** Make it: hands every scene to the background job. */
export function startBrief(data: {
  briefId: string
  scenes: (SceneDraft & { id?: string })[]
  playheadMs: number
}) {
  return startFn({ data })
}
/** Try again on the scene that failed. */
export function retryBriefScene(briefId: string, sceneId: string) {
  return retryFn({ data: { briefId, sceneId } })
}
/** Tells the server this editor laid these scenes, so the worker never lays them too. */
export function settleBriefScenes(data: {
  briefId: string
  sceneIds: string[]
  lanes: BriefLanding["lanes"]
}) {
  return settleFn({ data })
}
