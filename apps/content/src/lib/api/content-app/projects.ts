import { createServerFn } from "@tanstack/react-start"
import { and, eq } from "drizzle-orm"
import { z } from "zod"

import { createErrorMessage } from "@/lib/api/error-message"
import { readProjectParts, type ProjectParts } from "@/server/content-app/projects"
import { readDraftVideos, readFoundToday, type DraftVideoRow, type FoundTodayRow } from "@/server/content-app/widgets"
import { db } from "@/server/db"
import { adminGet } from "@/server/guards"
import { promoProjects } from "@/server/social/schema"
import { ownedProject } from "@/server/social/projects"

export type { DraftVideoRow, FoundTodayRow, ProjectParts }

/**
 * A project's Research and Videos, for its left panel
 * (`workspace/docs/content-app.md`, "A project's own page"). The project must
 * be the signed-in admin's own; its research and video rows are made first if
 * they are missing.
 */
const partsFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ projectId: z.string().min(1).max(36) }))
  .handler(async ({ data, context }): Promise<ProjectParts> => {
    await ownedProject(context.user.id, data.projectId)
    return readProjectParts(context.user.id, data.projectId)
  })

export function loadProjectParts(projectId: string) {
  return partsFn({ data: { projectId } })
}

export const getPartsErrorMessage = createErrorMessage(
  {
    "project does not exist": "That project is not there any more. Reload the page.",
    "would not come out of storage": "A file of one of this project's videos would not come out of storage. Try again.",
  },
  "This project's research and videos could not be read. Try again."
)

const widgetsFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async ({ context }): Promise<{ found: FoundTodayRow[]; drafts: DraftVideoRow[] }> => {
    const [found, drafts] = await Promise.all([readFoundToday(context.user.id), readDraftVideos(context.user.id)])
    return { found, drafts }
  })

/** Found today and Videos in progress, for Overview. */
export function loadContentWidgets() {
  return widgetsFn()
}

const projectNameFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ projectId: z.string().min(1).max(36) }))
  .handler(async ({ data, context }): Promise<{ id: string; name: string } | null> => {
    const [project] = await db
      .select({ id: promoProjects.id, name: promoProjects.name })
      .from(promoProjects)
      .where(and(eq(promoProjects.id, data.projectId), eq(promoProjects.userId, context.user.id)))
      .limit(1)
    return project ?? null
  })

/**
 * The project a video project belongs to, for the editor's back button: the
 * same id, when it is the signed-in admin's own project. Null for a video
 * project made outside a project, which goes back to the video projects list.
 */
export function loadEditorProject(projectId: string) {
  return projectNameFn({ data: { projectId } })
}
