import { createFileRoute, redirect } from "@tanstack/react-router"

import {
  isAccountTab,
  type AccountTab,
} from "@/components/account/account-dialog"
import { MemberHome } from "@/components/home/member-home"
import { routeErrorComponent } from "@/components/shell/route-error"
import {
  getMemberHomeErrorMessage,
  loadMemberHomePage,
} from "@/lib/api/member-home"
import {
  DEFAULT_ADMIN_ROUTE,
  configuredRouteTarget,
  withAccountTab,
} from "@/lib/home-route"

/**
 * Home is two different things.
 *
 * For an admin it is a signpost: they go to the page they configured, or to the
 * Overview when they have not chosen one, and a link arriving with a tab in it
 * (`?account=billing`, from the pricing page) carries that tab along — home is
 * on the way through, not the destination, so it must not overrule the ask.
 *
 * For everybody else it is a real page: their plan, their notices and their own
 * feedback. An admin can still send members straight to another page by setting
 * a member home route, and that redirect wins over this one.
 */
export const Route = createFileRoute("/_authenticated/home")({
  loader: async ({ location, parentMatchPromise }) => {
    // The shell above has already loaded all of this. Asking the server again
    // just to decide where to forward costs a second full wait on a database
    // that takes a second or two — see the note in `src/lib/api/shell.ts`.
    const { user, settings } = (await parentMatchPromise).loaderData ?? {}
    const isAdmin = user?.role === "admin"
    const target = isAdmin
      ? (configuredRouteTarget(settings?.adminRoute) ?? DEFAULT_ADMIN_ROUTE)
      : configuredRouteTarget(settings?.memberHomeRoute)

    if (target) {
      throw redirect({
        href: withAccountTab(target, requestedAccountTab(location.search)),
        // Replace, never push. A page that only forwards must not sit in the
        // browser's history: Back would land on it and be forwarded straight
        // out again, so the front page could not be reached at all.
        replace: true,
      })
    }

    return { home: await loadMemberHomePage() }
  },
  component: HomeRoute,
  errorComponent: routeErrorComponent(getMemberHomeErrorMessage),
})

/**
 * The tab a link asked for.
 *
 * The router types a loader's `location.search` as empty whatever the route's
 * schema says, so this narrows it back with `isAccountTab` — the same guard the
 * parent route validates with, so nothing wider than `?account=` already allows
 * can get through.
 */
function requestedAccountTab(search: unknown): AccountTab | undefined {
  const value = (search as { account?: unknown } | null | undefined)?.account
  return isAccountTab(value) ? value : undefined
}

function HomeRoute() {
  const { home } = Route.useLoaderData()

  return <MemberHome home={home} />
}
