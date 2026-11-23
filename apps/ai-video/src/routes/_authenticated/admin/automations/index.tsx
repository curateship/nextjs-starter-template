import { createFileRoute } from "@tanstack/react-router"

import { AutomationsDashboard } from "@/components/automations-dashboard"

export const Route = createFileRoute("/_authenticated/admin/automations/")({
  component: AutomationsDashboard,
})
