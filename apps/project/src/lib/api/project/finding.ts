import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { userGet } from "@/server/guards"
import { inTeam } from "@/server/project/access"
import { teamScope } from "@/lib/api/project/scope"
import { loadTeamActivity } from "@/server/project/project-activity"
import { searchTasks } from "@/server/project/search"
import { loadTeamTrends } from "@/server/project/team-figures"

/**
 * Finding and seeing work: the header's search across every project, the
 * Team dashboard's Activity tab and its Trends window. Saved views are the
 * shell's (`src/lib/api/saved-views.ts`).
 */

export type { SavedView } from "@/server/project/saved-views"
export type { SearchHit } from "@/server/project/search"
export type { TrendWeek } from "@/server/project/team-figures"

const id = z.string().min(1).max(36)

const searchFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object({ q: z.string().max(200) }))
  .handler(async ({ data, context }) => searchTasks(context.user.id, data.q))

const teamActivityFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(
    z.object({ before: z.object({ at: z.string().datetime(), id }).optional(), ...teamScope })
  )
  .handler(async ({ data, context }) => inTeam(data.teamId, () => loadTeamActivity(context.user.id, data)))

const trendsFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object(teamScope))
  .handler(async ({ data, context }) => inTeam(data.teamId, () => loadTeamTrends(context.user.id)))

export function searchProjectTasks(q: string) {
  return searchFn({ data: { q } })
}
export function loadTeamActivityPage(before?: { at: string; id: string }, teamId?: string) {
  return teamActivityFn({ data: { before, teamId } })
}
export function loadTrends(teamId?: string) {
  return trendsFn({ data: { teamId } })
}
