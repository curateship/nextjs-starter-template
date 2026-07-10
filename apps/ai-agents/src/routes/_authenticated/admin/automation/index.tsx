import { createFileRoute } from "@tanstack/react-router"

import { WorkflowsDashboard } from "@/components/automation/workflows-dashboard"

export const Route = createFileRoute("/_authenticated/admin/automation/")({
  component: WorkflowsDashboard,
})
