import { createFileRoute, redirect } from "@tanstack/react-router"

import { AdminOverview } from "@/components/admin-overview"
import {
  configuredRouteTarget,
  loadShellSettings,
} from "@/lib/api/shell-settings"

/**
 * `/admin` shows the workspace overview by default. When General Settings sets
 * an `adminRoute`, it forwards there instead.
 */
export const Route = createFileRoute("/_authenticated/admin/")({
  loader: async () => {
    const { settings } = await loadShellSettings()
    const target = configuredRouteTarget(settings.adminRoute)
    if (target) {
      throw redirect({ href: target })
    }
    return null
  },
  component: AdminOverview,
})
