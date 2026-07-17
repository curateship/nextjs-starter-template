import { createFileRoute, redirect } from "@tanstack/react-router"

import { loadShellSettings } from "@/lib/api/shell-settings"
import { configuredRouteTarget } from "@/lib/home-route"

/**
 * Admin home forwards to the configured route, or Profiles by default. Target
 * admin pages gate themselves.
 */
export const Route = createFileRoute("/_authenticated/admin/")({
  loader: async () => {
    const { settings } = await loadShellSettings()
    const target = configuredRouteTarget(settings.adminRoute) ?? "/profiles"
    throw redirect({ href: target })
  },
})
