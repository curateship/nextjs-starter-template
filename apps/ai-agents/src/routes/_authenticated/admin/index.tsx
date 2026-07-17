import { createFileRoute, redirect } from "@tanstack/react-router"

import { loadShellSettings } from "@/lib/api/shell-settings"
import { configuredRouteTarget } from "@/lib/home-route"

/**
 * Bare /admin forwards to the configured route, or Agents by default.
 */
export const Route = createFileRoute("/_authenticated/admin/")({
  loader: async () => {
    const { settings } = await loadShellSettings()
    const target = configuredRouteTarget(settings.adminRoute) ?? "/admin/agents"
    throw redirect({ href: target })
  },
})
