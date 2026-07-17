import { createFileRoute, redirect } from "@tanstack/react-router"

import { loadShellSettings } from "@/lib/api/shell-settings"
import { configuredRouteTarget } from "@/lib/home-route"

/**
 * Home forwards to the configured route, or the Home dashboard by default.
 */
export const Route = createFileRoute("/_authenticated/")({
  loader: async () => {
    const { settings } = await loadShellSettings()
    const target = configuredRouteTarget(settings.adminRoute) ?? "/admin/home"
    throw redirect({ href: target })
  },
})
