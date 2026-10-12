import { createFileRoute, useNavigate } from "@tanstack/react-router"

import { TaskTypesDashboard } from "@/components/project/task-types-dashboard"
import { TeamStart } from "@/components/project/team-start"
import { routeErrorComponent } from "@/components/shell/route-error"
import { loadTaskTypes } from "@/lib/api/project/task-types"
import { loadMyTeamInvites } from "@/lib/api/project/teams"
import { getProjectErrorMessage } from "@/lib/project/errors"
import { pageTitleHead } from "@/lib/project/page-title"

const ID = /^[\w-]{1,36}$/

type TaskTypesSearch = {
  /** The type open in the middle panel, so a pasted link opens it. */
  type?: string
}

function readSearch(search: Record<string, unknown>): TaskTypesSearch {
  return typeof search.type === "string" && ID.test(search.type) ? { type: search.type } : {}
}

/** The Task types dashboard: the team's types, the picked one's fields, and what it starts with. */
export const Route = createFileRoute("/_authenticated/task-types")({
  validateSearch: readSearch,
  // Picking another type doesn't reload the page; every type is already here.
  loaderDeps: () => ({}),
  loader: async () => {
    const page = await loadTaskTypes()
    return { page, invites: page ? [] : await loadMyTeamInvites() }
  },
  head: ({ matches }) => pageTitleHead("Task types", matches),
  component: TaskTypesRoute,
  errorComponent: routeErrorComponent(getProjectErrorMessage),
})

function TaskTypesRoute() {
  const { page, invites } = Route.useLoaderData()
  const { type } = Route.useSearch()
  const navigate = useNavigate()
  if (!page) return <TeamStart invites={invites} />
  return (
    <TaskTypesDashboard
      page={page}
      selectedId={type}
      onSelect={(typeId) => void navigate({ to: ".", search: { type: typeId } })}
    />
  )
}
