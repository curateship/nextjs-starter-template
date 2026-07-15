import { createFileRoute } from "@tanstack/react-router"

import { AlertsDashboard } from "@/components/alerts/alerts-dashboard"
import { loadAlertsPage } from "@/lib/api/alerts"

export const Route = createFileRoute("/_authenticated/alerts")({
  loader: () => loadAlertsPage(),
  component: AlertsRoute,
})

function AlertsRoute() {
  return <AlertsDashboard initial={Route.useLoaderData()} />
}
