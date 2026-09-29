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
 * Every creator you track, at `/social`.
 *
 * The front door of Social, and a screen of its own rather than a panel on a
 * creator's dashboard: the list and one creator are two subjects, and
 * splitting them is what puts the creator in the address, makes the back
 * button work, and lets a link to one creator be pasted to somebody else. The
 * flow runs and the backtests are built the same way.
 *
 * **The search, the filters and the sort are search params**, declared as
 * loader deps so a changed address re-reads the list from the server. The
 * search reads the words of every post held, which the browser does not have.
 */
export const Route = createFileRoute("/_authenticated/social")({
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
  component: SocialListRoute,
  errorComponent: routeErrorComponent(getSocialCreatorsErrorMessage),
})

function SocialListRoute() {
  useTradePageTitle("Creators")
  const search = Route.useSearch()

  return (
    <CreatorsListPage
      initial={Route.useLoaderData()}
      query={creatorsQuery(search)}
    />
  )
}
