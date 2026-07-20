import { createFileRoute, redirect } from "@tanstack/react-router"

import { loadShellBootstrap } from "@/lib/api/shell"
import { configuredRouteTarget } from "@/lib/home-route"

/**
 * Home forwards admins to the configured route and members to their account,
 * so nobody lands on a page their role cannot open. One request covers both
 * the role and the configured target.
 */
export const Route = createFileRoute("/_authenticated/")({
  loader: async () => {
    const { user, settings } = await loadShellBootstrap()
    if (user?.role !== "admin") {
      throw redirect({ to: "/account" })
    }

    throw redirect({
      href: configuredRouteTarget(settings?.adminRoute) ?? "/admin/settings",
    })
  },
})
