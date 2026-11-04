import { createFileRoute } from "@tanstack/react-router"

import { AutomationTemplatesPage } from "@/components/automations/automation-templates-page"
import { routeErrorComponent } from "@/components/shell/route-error"
import {
  getAutomationTemplateLoadErrorMessage,
  loadAutomationTemplatesPage,
} from "@/lib/api/automations/automation-templates"

export const Route = createFileRoute(
  "/_authenticated/admin/automations_/templates"
)({
  gcTime: 0,
  loader: () => loadAutomationTemplatesPage(),
  component: AdminAutomationTemplatesRoute,
  errorComponent: routeErrorComponent(getAutomationTemplateLoadErrorMessage),
})

function AdminAutomationTemplatesRoute() {
  return <AutomationTemplatesPage initial={Route.useLoaderData()} />
}
