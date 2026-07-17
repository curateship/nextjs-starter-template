import { createFileRoute } from "@tanstack/react-router"

import { AutomationRoutePage } from "@/pages/automations/automation-route-page"

export const Route = createFileRoute(
  "/_authenticated/admin/automations/$automationId"
)({
  component: AutomationRoutePage,
})
