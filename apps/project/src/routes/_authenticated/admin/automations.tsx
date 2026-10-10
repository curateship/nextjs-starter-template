import { createFileRoute } from "@tanstack/react-router"

import { AutomationsListPage } from "@/components/automations/automations-list-page"
import {
  getAutomationLoadErrorMessage,
  loadAutomationsPage,
} from "@/lib/api/automations/automations"
import { routeErrorComponent } from "@/components/shell/route-error"

export const Route = createFileRoute("/_authenticated/admin/automations")({
  // This page owns a client-side copy of the loader result. Drop that copy
  // when the route closes, so returning after an editor save cannot redraw an
  // older list while the fresh loader answer arrives.
  gcTime: 0,
  loader: () => loadAutomationsPage(),
  component: AdminAutomationsRoute,
  errorComponent: routeErrorComponent(getAutomationLoadErrorMessage),
})

function AdminAutomationsRoute() {
  return <AutomationsListPage initial={Route.useLoaderData()} />
}
