import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { saveViewSchema } from "@/lib/project/saved-views"
import { userGet, userPost } from "@/server/guards"
import { loadTeamActivity } from "@/server/project/project-activity"
import { deleteView, saveView } from "@/server/project/saved-views"
import { searchTasks } from "@/server/project/search"
import { loadTeamTrends } from "@/server/project/team-figures"

/**
 * Finding and seeing work: the header's search across every project, saved
 * views, the Team dashboard's Activity tab and its Trends window.
 */

export type { SavedView } from "@/server/project/saved-views"
export type { SearchHit } from "@/server/project/search"
export type { TrendWeek } from "@/server/project/team-figures"

const id = z.string().min(1).max(36)

const searchFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object({ q: z.string().max(200) }))
  .handler(async ({ data, context }) => searchTasks(context.user.id, data.q))

const saveViewFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(saveViewSchema)
  .handler(async ({ data, context }) => saveView(context.user.id, data))

const deleteViewFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ viewId: id }))
  .handler(async ({ data, context }) => deleteView(context.user.id, data.viewId))

const teamActivityFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(
    z.object({ before: z.object({ at: z.string().datetime(), id }).optional() })
  )
  .handler(async ({ data, context }) => loadTeamActivity(context.user.id, data))

const trendsFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }) => loadTeamTrends(context.user.id))

export function searchProjectTasks(q: string) {
  return searchFn({ data: { q } })
}
export function saveProjectView(data: z.input<typeof saveViewSchema>) {
  return saveViewFn({ data })
}
export function deleteProjectView(viewId: string) {
  return deleteViewFn({ data: { viewId } })
}
export function loadTeamActivityPage(before?: { at: string; id: string }) {
  return teamActivityFn({ data: { before } })
}
export function loadTrends() {
  return trendsFn()
}
