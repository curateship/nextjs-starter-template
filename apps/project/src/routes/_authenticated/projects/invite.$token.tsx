import { createFileRoute } from "@tanstack/react-router"

import { InvitePage } from "@/components/project/invite-page"
import { routeErrorComponent } from "@/components/shell/route-error"
import { loadTeamInvite } from "@/lib/api/project/teams"
import { getProjectErrorMessage } from "@/lib/project/errors"

/**
 * Where an emailed invite link opens. It sits under /projects so the page is
 * titled like the rest of Project. Someone signed out is sent to sign in first
 * and brought back here.
 */
export const Route = createFileRoute("/_authenticated/projects/invite/$token")({
  loader: ({ params }) => loadTeamInvite(params.token),
  component: InviteRoute,
  errorComponent: routeErrorComponent(getProjectErrorMessage),
})

function InviteRoute() {
  return <InvitePage invite={Route.useLoaderData()} />
}
