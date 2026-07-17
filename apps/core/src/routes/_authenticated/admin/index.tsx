import { createFileRoute, redirect } from "@tanstack/react-router"

import { loadShellSettings } from "@/lib/api/shell-settings"
import { configuredRouteTarget } from "@/lib/home-route"

/**
 * `/admin` forwards to the configured home route, or Datasource by default.
 */
export const Route = createFileRoute("/_authenticated/admin/")({
  loader: async () => {
    const { settings } = await loadShellSettings()
    const target = configuredRouteTarget(settings.adminRoute) ?? "/admin/datasource"
    throw redirect({ href: target })
  },
})
