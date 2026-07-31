import { createFileRoute } from "@tanstack/react-router"

import { AutomationsListPage } from "@/components/automations/automations-list-page"
import { loadAutomationsPage } from "@/lib/api/automations"

export const Route = createFileRoute("/_authenticated/admin/automations")({
  loader: () => loadAutomationsPage(),
  component: AdminAutomationsRoute,
})

function AdminAutomationsRoute() {
  return <AutomationsListPage initial={Route.useLoaderData()} />
}
