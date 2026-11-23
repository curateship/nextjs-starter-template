import { createFileRoute } from "@tanstack/react-router"

import {
  AutomationRouteContent,
  AutomationRouteError,
} from "@/components/automations/automation-route-content"
import { getAutomation, loadAutomationFavorites } from "@/lib/api/automations"

export const Route = createFileRoute(
  "/_authenticated/automations/$automationId"
)({
  // `?view=backtest|bot` opens the editor straight in that mode — the run
  // dashboards deep-link here.
  validateSearch: (
    search: Record<string, unknown>
  ): { view?: "backtest" | "bot" } => ({
    view:
      search.view === "backtest" || search.view === "bot"
        ? search.view
        : undefined,
  }),
  loader: async ({ params }) => {
    const [automation, favorites] = await Promise.all([
      getAutomation(params.automationId),
      loadAutomationFavorites(),
    ])
    return { automation, favoriteNodeKeys: favorites.favoriteNodeKeys }
  },
  errorComponent: AutomationRouteError,
  component: AutomationRouteContent,
})
