import { createFileRoute } from "@tanstack/react-router"

import { AdminOverview } from "@/components/admin-overview"

/**
 * The home route. Redirects to the route configured in General Settings
 * (`adminRoute`), or shows the workspace overview when that's empty.
 */
export const Route = createFileRoute("/_authenticated/")({
  component: AdminOverview,
})
