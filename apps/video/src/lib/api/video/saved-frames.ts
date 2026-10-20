import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { describeAuthError } from "../error-message"
import { PROJECT_NOT_FOUND_MESSAGE } from "@/lib/video/projects"
import {
  MEDIA_MISSING_MESSAGE,
  NOTHING_TO_EXPORT_MESSAGE,
  RENDER_NOT_FOUND_MESSAGE,
} from "@/lib/video/render"
import {
  FRAME_BUSY_MESSAGE,
  FRAME_FAILED_MESSAGE,
} from "@/lib/video/saved-frames"
import { SAVED_TIMELINE_INVALID_MESSAGE } from "@/lib/video/timeline-schema"
import { editorPost } from "@/server/video/editor-guards"
import { actorFor, actorForExport } from "@/server/video/project-guests"
import {
  saveOwnedExportFrame,
  saveOwnedProjectFrame,
  type SavedFrame,
} from "@/server/video/saved-frames"

/**
 * Keeping one frame as a picture in the media library, from a finished export
 * or from the editor. Both belong to whoever is signed in, never to an id the
 * request names.
 */

export type { SavedFrame }

const KNOWN_MESSAGES = new Set([
  FRAME_BUSY_MESSAGE,
  FRAME_FAILED_MESSAGE,
  MEDIA_MISSING_MESSAGE,
  PROJECT_NOT_FOUND_MESSAGE,
  RENDER_NOT_FOUND_MESSAGE,
  NOTHING_TO_EXPORT_MESSAGE,
  SAVED_TIMELINE_INVALID_MESSAGE,
])

export function getSavedFrameErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : ""
  if (KNOWN_MESSAGES.has(message)) return message
  return describeAuthError(message) ?? `${FRAME_FAILED_MESSAGE}.`
}

const atMsSchema = z.number().nonnegative().finite()

// A guest sent from Project may keep frames of their own project
// (`workspace/docs/project-guests.md`).
const saveExportFrameFn = createServerFn({ method: "POST" })
  .middleware([editorPost])
  .inputValidator(
    z.object({ exportId: z.string().min(1).max(36), atMs: atMsSchema })
  )
  .handler(async ({ data, context }) => {
    const { userId } = await actorForExport(context.caller, data.exportId)
    return saveOwnedExportFrame({
      userId,
      exportId: data.exportId,
      atMs: data.atMs,
    })
  })

const saveProjectFrameFn = createServerFn({ method: "POST" })
  .middleware([editorPost])
  .inputValidator(
    z.object({ projectId: z.string().min(1).max(36), atMs: atMsSchema })
  )
  .handler(async ({ data, context }) => {
    const { userId } = await actorFor(context.caller, data.projectId)
    return saveOwnedProjectFrame({
      userId,
      projectId: data.projectId,
      atMs: data.atMs,
    })
  })

export function saveExportFrame(exportId: string, atMs: number) {
  return saveExportFrameFn({ data: { exportId, atMs } })
}

export function saveProjectFrame(projectId: string, atMs: number) {
  return saveProjectFrameFn({ data: { projectId, atMs } })
}
