import { createFileRoute, redirect } from "@tanstack/react-router"

import { configuredRouteTarget, DEFAULT_ADMIN_ROUTE } from "@/lib/home-route"

/**
 * `/admin` forwards to the configured home route, or the Overview by default.
 * It reads the setting the shell already loaded rather than asking the server
 * again, so the forward happens without a second full wait.
 */
export const Route = createFileRoute("/_authenticated/admin/")({
  loader: async ({ parentMatchPromise }) => {
    const shell = (await parentMatchPromise).loaderData
    const target =
      configuredRouteTarget(shell?.settings?.adminRoute) ?? DEFAULT_ADMIN_ROUTE
    // Replace, never push — see the note on `/home`. This page only forwards,
    // so leaving it in the history turns Back into a bounce.
    throw redirect({ href: target, replace: true })
  },
})
