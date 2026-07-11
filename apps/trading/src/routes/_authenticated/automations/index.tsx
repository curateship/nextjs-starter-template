import { createFileRoute } from "@tanstack/react-router"

import { AutomationsRouteContent } from "@/components/automations/automations-route-content"
import { listAutomations } from "@/lib/api/automations"

export const Route = createFileRoute("/_authenticated/automations/")({
  loader: () => listAutomations(),
  component: AutomationsRouteContent,
})
