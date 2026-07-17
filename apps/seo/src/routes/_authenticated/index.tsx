import { createFileRoute, redirect } from "@tanstack/react-router"

import { loadShellSettings } from "@/lib/api/shell-settings"
import { configuredRouteTarget } from "@/lib/home-route"

/**
 * Home forwards to the configured route, or Overview by default.
 */
export const Route = createFileRoute("/_authenticated/")({
  loader: async () => {
    const { settings } = await loadShellSettings()
    const target = configuredRouteTarget(settings.adminRoute) ?? "/overview"
    throw redirect({ href: target })
  },
})
