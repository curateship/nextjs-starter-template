import * as React from "react"
import { createFileRoute, redirect, useSearch } from "@tanstack/react-router"

import {
  isAccountTab,
  useOpenAccount,
  type AccountTab,
} from "@/components/account/account-dialog"
import { loadShellBootstrap } from "@/lib/api/shell"
import { configuredRouteTarget, withAccountTab } from "@/lib/home-route"

/**
 * Home forwards admins to the configured route. Members have no dashboard pages
 * of their own, so home opens their account, which now lives in a modal.
 *
 * Either way, a link that arrives asking for a tab (`?account=billing`, from
 * the pricing page) gets that tab. Home is on the way through, not the
 * destination, so it must not overrule the ask.
 */
export const Route = createFileRoute("/_authenticated/")({
  // Deliberately no `loaderDeps` for the tab. An admin is always redirected
  // away, so this loader runs fresh on every arrival and has no value to watch.
  // A member does stay, and their own effect below sets `?account=profile` —
  // which as a dep counts as a change and refetches the whole shell a second
  // time on every visit home, for nothing.
  loader: async ({ location }) => {
    const { user, settings } = await loadShellBootstrap()
    if (user?.role === "admin") {
      throw redirect({
        href: withAccountTab(
          configuredRouteTarget(settings?.adminRoute) ?? "/admin/settings",
          requestedAccountTab(location.search)
        ),
      })
    }

    return null
  },
  component: MemberHome,
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

function MemberHome() {
  const openAccount = useOpenAccount()
  const { account } = useSearch({ from: "/_authenticated" })

  React.useEffect(() => {
    // Only fall back to Profile when nothing was asked for, or a link that
    // arrived asking for Billing gets overruled on the doorstep.
    if (!account) openAccount("profile")
  }, [account, openAccount])

  return null
}
