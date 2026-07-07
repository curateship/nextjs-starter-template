import { createFileRoute } from "@tanstack/react-router"

import { AutomationCanvas } from "@/components/automation/automation-canvas"

export const Route = createFileRoute("/_authenticated/admin/automation/")({
  component: AutomationCanvas,
})
