import { createFileRoute, notFound } from "@tanstack/react-router"

import { TeamPage } from "@/components/pomodoro/team-page"
import { routeErrorComponent } from "@/components/shell/route-error"
import { readTeamPage } from "@/lib/api/pomodoro/teams"
import { isHandleAvailableShape } from "@/lib/pomodoro/public-profile"

/**
 * A focus group's public page, `/team/<handle>` (public profile task 05).
 *
 * Under `_pomodoro` for the same reason `/u/<handle>` is: a page a stranger
 * lands on from a shared link is still this app's page, drawn with its tokens.
 *
 * A handle that is not handle-shaped, one nobody holds, a page switched off
 * and an owner no longer on Pro all answer the same 404. The shape check runs
 * here, before the endpoint is called, so a NUL byte never reaches Postgres.
 */
export const Route = createFileRoute("/_pomodoro/team/$handle")({
  loader: async ({ params }) => {
    const handle = params.handle.toLowerCase()
    if (!isHandleAvailableShape(handle)) throw notFound()
    const team = await readTeamPage(handle)
    if (!team) throw notFound()
    return { team }
  },
  errorComponent: routeErrorComponent(
    () => "This team page could not be loaded. Reload to try again."
  ),
  component: TeamPageRoute,
  head: ({ loaderData }) => {
    if (!loaderData) return {}
    const { team } = loaderData
    const title = `${team.name} · Team`
    const description = `The focus hours of the people in ${team.name}, as each of them chose to publish them.`
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
      ],
    }
  },
})

function TeamPageRoute() {
  const { team } = Route.useLoaderData()
  return <TeamPage team={team} />
}
