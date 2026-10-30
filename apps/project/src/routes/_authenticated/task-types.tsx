import { createFileRoute, useNavigate } from "@tanstack/react-router"

import { TaskTypesDashboard } from "@/components/project/task-types-dashboard"
import { TeamStart } from "@/components/project/team-start"
import { routeErrorComponent } from "@/components/shell/route-error"
import { loadTaskTypes } from "@/lib/api/project/task-types"
import { getProjectErrorMessage } from "@/lib/project/errors"
import { pageTitleHead } from "@/lib/project/page-title"
import { readId } from "@/lib/project/team-route"
import { TeamScope } from "@/lib/project/team-scope"


type TaskTypesSearch = {
  /** The type open in the middle panel, so a pasted link opens it. */
  type?: string
  /** The site admin's team filter; a type belongs to one team. */
  team?: string
}

function readSearch(search: Record<string, unknown>): TaskTypesSearch {
  const result: TaskTypesSearch = {}
  const type = readId(search.type)
  if (type) result.type = type
  const team = readId(search.team)
  if (team) result.team = team
  return result
}

/** The Task types dashboard: the team's types, the picked one's fields, and what it starts with. */
export const Route = createFileRoute("/_authenticated/task-types")({
  validateSearch: readSearch,
  // Picking another type doesn't reload the page; every type is already here.
  // Another team does.
  loaderDeps: ({ search }) => ({ team: readSearch(search).team }),
  loader: async ({ deps }) => {
    const page = await loadTaskTypes(deps.team)
    return { page }
  },
  head: ({ matches }) => pageTitleHead("Task templates", matches),
  component: TaskTypesRoute,
  errorComponent: routeErrorComponent(getProjectErrorMessage),
})

function TaskTypesRoute() {
  const { page } = Route.useLoaderData()
  const { type, team } = Route.useSearch()
  const navigate = useNavigate()
  if (!page) return <TeamStart />
  return (
    <TeamScope teamId={page.teamId ?? undefined}>
      <TaskTypesDashboard
        page={page}
        selectedId={type}
        onSelect={(typeId) => void navigate({ to: ".", search: { type: typeId, team } })}
        onTeam={(teamId) => void navigate({ to: ".", search: { team: teamId } })}
      />
    </TeamScope>
  )
}
