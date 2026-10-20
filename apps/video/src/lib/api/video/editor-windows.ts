import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import {
  EDITOR_WINDOW_MODES,
  type EditorWindowMode,
} from "@/lib/video/editor-windows"
import { actorFor, editorPost } from "@/server/video/project-guests"
import {
  checkInEditorWindow,
  leaveEditorWindow,
} from "@/server/video/editor-windows"

/**
 * An editor window saying it has a project open, and saying it has closed.
 * Both are writes, so both carry the same-site check every change does.
 */

const windowSchema = z.object({
  projectId: z.string().min(1).max(36),
  windowId: z.string().uuid(),
})

// A guest sent from Project's editor window counts like any other
// (`workspace/docs/project-guests.md`).
const checkInFn = createServerFn({ method: "POST" })
  .middleware([editorPost])
  .inputValidator(windowSchema.extend({ mode: z.enum(EDITOR_WINDOW_MODES) }))
  .handler(async ({ data, context }) => {
    const { userId } = await actorFor(context.caller, data.projectId)
    return checkInEditorWindow(
      userId,
      data.projectId,
      data.windowId,
      data.mode
    )
  })

const leaveFn = createServerFn({ method: "POST" })
  .middleware([editorPost])
  .inputValidator(windowSchema)
  .handler(async ({ data, context }) => {
    const { userId } = await actorFor(context.caller, data.projectId)
    await leaveEditorWindow(userId, data.projectId, data.windowId)
  })

export function reportEditorWindowOpen(
  projectId: string,
  windowId: string,
  mode: EditorWindowMode
) {
  return checkInFn({ data: { projectId, windowId, mode } })
}

/**
 * Sent with `keepalive`, so it still reaches the server when it is sent from
 * a tab that is closing or reloading.
 */
export function reportEditorWindowClosed(projectId: string, windowId: string) {
  return leaveFn({
    data: { projectId, windowId },
    fetch: (input, init) => fetch(input, { ...init, keepalive: true }),
  })
}
