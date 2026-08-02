import { createFileRoute, redirect } from "@tanstack/react-router"

import { configuredRouteTarget } from "@/lib/home-route"

/**
 * `/admin` forwards to the configured home route, or Settings by default. It
 * reads the setting the shell already loaded rather than asking the server
 * again, so the forward happens without a second full wait.
 */
export const Route = createFileRoute("/_authenticated/admin/")({
  loader: async ({ parentMatchPromise }) => {
    const shell = (await parentMatchPromise).loaderData
    const target =
      configuredRouteTarget(shell?.settings?.adminRoute) ?? "/admin/settings"
    throw redirect({ href: target })
  },
})
