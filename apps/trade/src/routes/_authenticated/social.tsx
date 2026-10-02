import { createFileRoute } from "@tanstack/react-router"

import {
  tradePageTitle,
  useTradePageTitle,
  type TitleMatch,
} from "@/app/page-title"
import { SocialFeedPage } from "@/components/social/social-feed-page"
import { routeErrorComponent } from "@/components/shell/route-error"
import { loadRememberedChartView } from "@/lib/api/trade/chart-view"
import {
  getSocialFeedErrorMessage,
  loadSocialFeedData,
  type SocialFeed,
} from "@/lib/api/trade/social-feed"
import {
  emptyTradePanelLayouts,
  type TradePanelLayouts,
} from "@/lib/trade/panel-layout"

/**
 * What the loader hands the screen. Named rather than inferred, so the
 * route's type is not worked out from the component that reads it.
 */
type SocialFeedRouteData = {
  feed: SocialFeed
  panelLayouts: TradePanelLayouts
}

/**
 * The social feed, at `/social`: every creator you track, one feed.
 *
 * This address used to be the creators table; the table lives on at
 * `/social/manage`, reached through the cog in the left panel's header. An
 * old address carrying the table's search params still lands here — the feed
 * ignores them rather than failing, and the manage screen owns them at its
 * own address.
 *
 * The loader reads the folders, the creators and the newest page of posts in
 * one trip, because `workspace/docs/rules/instant-first.md` says the screen
 * answers from what the app already knows before anything else runs.
 */
export const Route = createFileRoute("/_authenticated/social")({
  // Named rather than inferred, the same reason `social_.$handle` names it:
  // inference here walks the router registry and gives up on the loader.
  head: ({ matches }: { matches: readonly TitleMatch[] }) => ({
    meta: [{ title: tradePageTitle(matches, "Social") }],
  }),
  // Dropped on close so coming back never draws an older feed.
  gcTime: 0,
  loader: async (): Promise<SocialFeedRouteData> => {
    const [feed, prefs] = await Promise.all([
      loadSocialFeedData(),
      loadRememberedChartView().catch(() => null),
    ])
    return {
      feed,
      panelLayouts: prefs?.panelLayouts ?? emptyTradePanelLayouts(),
    }
  },
  component: SocialFeedRoute,
  errorComponent: routeErrorComponent(getSocialFeedErrorMessage),
})

function SocialFeedRoute() {
  useTradePageTitle("Social")
  const { feed, panelLayouts } = Route.useLoaderData()

  return <SocialFeedPage initial={feed} initialPanelLayouts={panelLayouts} />
}
