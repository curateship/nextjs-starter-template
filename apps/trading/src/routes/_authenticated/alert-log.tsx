import { createFileRoute } from "@tanstack/react-router"

import { AlertLogDashboard } from "@/components/alerts/alert-log-dashboard"
import { loadAlertLog } from "@/lib/api/alerts"

export const Route = createFileRoute("/_authenticated/alert-log")({
  loader: () => loadAlertLog(),
  component: AlertLogRoute,
})

function AlertLogRoute() {
  return <AlertLogDashboard initial={Route.useLoaderData()} />
}
