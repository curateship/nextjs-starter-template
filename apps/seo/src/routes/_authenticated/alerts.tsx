import { createFileRoute } from "@tanstack/react-router"

import { AlertsDashboard } from "@/components/alerts-dashboard"
import { loadCurrentProject } from "@/lib/api/seo-projects"

export const Route = createFileRoute("/_authenticated/alerts")({
  loader: () => loadCurrentProject(),
  component: AlertsRoute,
})

function AlertsRoute() {
  const { project } = Route.useLoaderData()
  return <AlertsDashboard project={project} />
}
