import * as React from "react"
import { createFileRoute, redirect } from "@tanstack/react-router"

import { useOpenAccount } from "@/components/account-dialog"
import { loadShellBootstrap } from "@/lib/api/shell"
import { configuredRouteTarget } from "@/lib/home-route"

/**
 * Home forwards admins to the configured route. Members have no dashboard pages
 * of their own, so home opens their account, which now lives in a modal.
 */
export const Route = createFileRoute("/_authenticated/")({
  loader: async () => {
    const { user, settings } = await loadShellBootstrap()
    if (user?.role === "admin") {
      throw redirect({
        href: configuredRouteTarget(settings?.adminRoute) ?? "/admin/settings",
      })
    }

    return null
  },
  component: MemberHome,
})

function MemberHome() {
  const openAccount = useOpenAccount()
  React.useEffect(() => {
    openAccount("profile")
  }, [openAccount])

  return null
}
