import { createFileRoute } from "@tanstack/react-router"

import { tradePageTitle, useTradePageTitle } from "@/app/page-title"
import { routeErrorComponent } from "@/components/shell/route-error"
import { FollowingPage } from "@/components/social/following-page"
import {
  getCopyErrorMessage,
  readFollowing,
} from "@/lib/api/trade/copy-trading"

/**
 * Everybody the member follows or copies, at `/following`. Open to every
 * member; the settings cog's Following row links here.
 */
export const Route = createFileRoute("/_authenticated/following")({
  head: ({ matches }) => ({
    meta: [{ title: tradePageTitle(matches, "Following") }],
  }),
  gcTime: 0,
  loader: () => readFollowing(),
  component: FollowingRoute,
  errorComponent: routeErrorComponent(getCopyErrorMessage),
})

function FollowingRoute() {
  useTradePageTitle("Following")
  return <FollowingPage rows={Route.useLoaderData()} />
}
