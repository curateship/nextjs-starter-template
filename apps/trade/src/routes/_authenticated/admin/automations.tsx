import { createFileRoute } from "@tanstack/react-router"

import { AutomationsListPage } from "@/components/automations/automations-list-page"
import {
  getAutomationLoadErrorMessage,
  loadAutomationsPage,
} from "@/lib/api/automations"
import { routeErrorComponent } from "@/components/shell/route-error"

export const Route = createFileRoute("/_authenticated/admin/automations")({
  loader: () => loadAutomationsPage(),
  component: AdminAutomationsRoute,
  errorComponent: routeErrorComponent(getAutomationLoadErrorMessage),
})

function AdminAutomationsRoute() {
  return <AutomationsListPage initial={Route.useLoaderData()} />
}
