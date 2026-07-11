import { createFileRoute } from "@tanstack/react-router"

import {
  AutomationRouteContent,
  AutomationRouteError,
} from "@/components/automations/automation-route-content"
import { getAutomation } from "@/lib/api/automations"
import { loadTradingContext } from "@/lib/api/trading"

export const Route = createFileRoute(
  "/_authenticated/automations/$automationId"
)({
  loader: async ({ params }) => {
    const [automation, trading] = await Promise.all([
      getAutomation(params.automationId),
      loadTradingContext(),
    ])
    return { automation, trading }
  },
  errorComponent: AutomationRouteError,
  component: AutomationRouteContent,
})
