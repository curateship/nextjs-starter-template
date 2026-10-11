import { createFileRoute } from "@tanstack/react-router"

import { JoinPage } from "@/components/project/join-page"
import { routeErrorComponent } from "@/components/shell/route-error"
import { loadJoinLink } from "@/lib/api/project/team-running"
import { getProjectErrorMessage } from "@/lib/project/errors"
import { pageTitleHead } from "@/lib/project/page-title"

/**
 * Where a team's join link opens. Like an invite, it sits under /projects,
 * and someone signed out is sent to sign in first and brought back here.
 */
export const Route = createFileRoute("/_authenticated/projects/join/$token")({
  loader: async ({ params }) => ({ offer: await loadJoinLink(params.token), token: params.token }),
  head: ({ matches }) => pageTitleHead("Join", matches),
  component: JoinRoute,
  errorComponent: routeErrorComponent(getProjectErrorMessage),
})

function JoinRoute() {
  const { offer, token } = Route.useLoaderData()
  return <JoinPage offer={offer} token={token} />
}
