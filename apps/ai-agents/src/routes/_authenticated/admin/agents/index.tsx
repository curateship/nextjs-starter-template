import { createFileRoute } from "@tanstack/react-router"

import { AgentsDashboard } from "@/components/agents-dashboard"

export const Route = createFileRoute("/_authenticated/admin/agents/")({
  component: AgentsDashboard,
})
