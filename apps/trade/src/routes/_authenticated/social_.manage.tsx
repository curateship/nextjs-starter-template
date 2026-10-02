import { createFileRoute } from "@tanstack/react-router"

import {
  tradePageTitle,
  useTradePageTitle,
  type TitleMatch,
} from "@/app/page-title"
import { CreatorsListPage } from "@/components/social/creators-list-page"
import { routeErrorComponent } from "@/components/shell/route-error"
import {
  getSocialCreatorsErrorMessage,
  listCreators,
  type SocialCreatorsList,
} from "@/lib/api/trade/social"
import {
  creatorsQuery,
  readCreatorsSearch,
  type SocialCreatorsSearch,
} from "@/lib/trade/social/creators-query"

/**
 * Every creator you track, as a sortable table, at `/social/manage`.
 *
 * This was `/social` until the feed took that address. The table stayed
 * because Tyler asked for its sortable Followers, Posts and Last post columns
 * on 29 Sep 2026, and the feed's left panel sorts one way only. The way in is
 * the cog in the feed's left panel header.
 *
 * Named `social_.manage` for the same reason `social_.$handle` is: this
 * screen and the feed are siblings rather than one nested inside the other.
 * The static segment outranks `$handle`, so no creator called "manage" is
 * ever looked up.
 *
 * **The search, the filters and the sort are search params**, declared as
 * loader deps so a changed address re-reads the list from the server. The
 * search reads the words of every post held, which the browser does not have.
 */
export const Route = createFileRoute("/_authenticated/social_/manage")({
  validateSearch: (search: Record<string, unknown>): SocialCreatorsSearch =>
    readCreatorsSearch(search),
  // Named rather than inferred, the same reason `social_.$handle` names it:
  // inference here walks the router registry and gives up on the loader.
  head: ({ matches }: { matches: readonly TitleMatch[] }) => ({
    meta: [{ title: tradePageTitle(matches, "Creators") }],
  }),
  // Dropped on close so coming back never draws an older list, or a list
  // narrowed by filters that have since been cleared.
  gcTime: 0,
  loaderDeps: ({ search }) => search,
  // Cleaned again on the way out. `validateSearch` narrows what the screen
  // reads without rewriting the address, so a hand-edited `?posts=loads` is
  // still in the deps handed to the loader — the same trap the login page's
  // redirect hit. The endpoint falls back on junk too; this keeps the
  // request honest before it gets there.
  loader: ({ deps }): Promise<SocialCreatorsList> =>
    listCreators(readCreatorsSearch(deps)),
  component: SocialManageRoute,
  errorComponent: routeErrorComponent(getSocialCreatorsErrorMessage),
})

function SocialManageRoute() {
  useTradePageTitle("Creators")
  const search = Route.useSearch()

  return (
    <CreatorsListPage
      initial={Route.useLoaderData()}
      query={creatorsQuery(search)}
    />
  )
}
