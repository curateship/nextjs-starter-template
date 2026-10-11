import { createFileRoute } from "@tanstack/react-router"

import { TeamDashboardScreen, type TeamSearch } from "@/components/project/team-dashboard"
import { routeErrorComponent } from "@/components/shell/route-error"
import { loadTeamCheckins } from "@/lib/api/project/checkins"
import { loadMeetings } from "@/lib/api/project/meetings"
import { isRealDay } from "@/lib/project/days"
import { loadFigures, loadMyTeamInvites, loadTeamDashboardPage } from "@/lib/api/project/teams"
import { getProjectErrorMessage } from "@/lib/project/errors"

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/
const ID = /^[\w-]{1,36}$/

function readSearch(search: Record<string, unknown>): TeamSearch {
  const result: TeamSearch = {}
  if (typeof search.month === "string" && MONTH.test(search.month)) result.month = search.month
  if (typeof search.day === "string" && isRealDay(search.day)) result.day = search.day
  if (typeof search.task === "string" && ID.test(search.task)) result.task = search.task
  return result
}

/** The Team dashboard: the team, a calendar of its check-ins and meetings, and one day's check-ins. */
export const Route = createFileRoute("/_authenticated/team/")({
  validateSearch: readSearch,
  // Opening a task doesn't reload the page; a new month or day does. The
  // address is read again here because the signed-in route above passes every
  // value through, so a value this route refused would otherwise still arrive.
  loaderDeps: ({ search }) => {
    const { month, day } = readSearch(search)
    return { month, day }
  },
  loader: async ({ deps }) => {
    const [data, checkins, meetings, figures] = await Promise.all([
      loadTeamDashboardPage(),
      loadTeamCheckins({ month: deps.month, day: deps.day }),
      loadMeetings({ month: deps.month, day: deps.day }),
      loadFigures(),
    ])
    return { data, checkins, meetings, figures, invites: data ? [] : await loadMyTeamInvites() }
  },
  component: TeamRoute,
  errorComponent: routeErrorComponent(getProjectErrorMessage),
})

function TeamRoute() {
  const { data, checkins, meetings, figures, invites } = Route.useLoaderData()
  return (
    <TeamDashboardScreen
      data={data}
      checkins={checkins}
      meetings={meetings}
      figures={figures}
      invites={invites}
      search={Route.useSearch()}
    />
  )
}
