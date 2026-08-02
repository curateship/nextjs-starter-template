import { createFileRoute, redirect } from "@tanstack/react-router"
import { CompassIcon } from "lucide-react"

import {
  isAccountTab,
  useOpenAccount,
  type AccountTab,
} from "@/components/account/account-dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { loadShellBootstrap } from "@/lib/api/shell"
import {
  configuredRouteTarget,
  firstSidebarRoute,
  withAccountTab,
} from "@/lib/home-route"

/**
 * Home is a signpost, not a page: it forwards everybody to their first real
 * screen. An admin goes to the route they configured; everybody else goes to
 * theirs, and with none set, to the first link in the sidebar an admin built
 * for them.
 *
 * Either way, a link that arrives asking for a tab (`?account=billing`, from
 * the pricing page) gets that tab. Home is on the way through, not the
 * destination, so it must not overrule the ask.
 *
 * Only somebody with nowhere at all to go stays here, and they are told so —
 * home used to open the account window at them instead, which read as a page
 * that would not go away.
 */
export const Route = createFileRoute("/_authenticated/")({
  // Deliberately no `loaderDeps` for the tab: the account tab only rides along
  // with the redirect, and watching it would refetch the whole shell a second
  // time on every visit home for nothing.
  loader: async ({ location }) => {
    const { user, settings } = await loadShellBootstrap()
    const isAdmin = user?.role === "admin"
    // `settings.sections` is already the sidebar this person actually gets —
    // the server hands an admin their own and everybody else the member one.
    const target = isAdmin
      ? (configuredRouteTarget(settings?.adminRoute) ?? "/admin/settings")
      : (configuredRouteTarget(settings?.memberHomeRoute) ??
        firstSidebarRoute(settings?.sections, user?.role ?? "member"))

    if (target) {
      throw redirect({
        href: withAccountTab(target, requestedAccountTab(location.search)),
      })
    }

    return null
  },
  component: NowhereToGo,
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

/**
 * Nobody reaches this with a sidebar: an admin always has a route to go to, and
 * a member only lands here when every link has been hidden or deleted. Said the
 * way the empty sidebar says it — whose decision this was, and the one place
 * they can still go.
 */
function NowhereToGo() {
  const openAccount = useOpenAccount()

  return (
    <Card size="sm">
      <CardContent className="grid place-items-center gap-3 py-10 text-center text-sm text-muted-foreground">
        <CompassIcon className="size-10" aria-hidden />
        <div>
          <p className="font-medium text-foreground">Nothing here yet</p>
          <p className="mt-1">An admin decides which pages appear for you.</p>
        </div>
        <Button type="button" onClick={() => openAccount("profile")}>
          Open account
        </Button>
      </CardContent>
    </Card>
  )
}
