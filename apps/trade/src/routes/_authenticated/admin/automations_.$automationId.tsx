import { createFileRoute } from "@tanstack/react-router"

import { AutomationEditor } from "@/components/automations/automation-editor"
import { loadAutomationRunsPanel } from "@/lib/api/automation-runs"
import {
  getAutomation,
  getAutomationLoadErrorMessage,
  loadAutomationFavorites,
} from "@/lib/api/automations"
import { routeErrorComponent } from "@/components/shell/route-error"

/**
 * `?run=<id>` is which run the bottom panel opens with — that is what makes one
 * run linkable from a bell notice. Checked before use, and dropped when it is
 * not a usable id.
 */
type EditorSearch = { run?: string }

function readEditorSearch(search: Record<string, unknown>): EditorSearch {
  return {
    run:
      typeof search.run === "string" && search.run.length <= 36
        ? search.run
        : undefined,
  }
}

export const Route = createFileRoute(
  "/_authenticated/admin/automations_/$automationId"
)({
  validateSearch: readEditorSearch,
  loader: async ({ params }) => {
    const [automation, favorites, runs] = await Promise.all([
      getAutomation(params.automationId),
      loadAutomationFavorites(),
      loadAutomationRunsPanel(params.automationId),
    ])
    return { automation, favoriteNodeKeys: favorites.favoriteNodeKeys, runs }
  },
  component: AdminAutomationEditorRoute,
  errorComponent: routeErrorComponent(getAutomationLoadErrorMessage),
})

function AdminAutomationEditorRoute() {
  const { automation, favoriteNodeKeys, runs } = Route.useLoaderData()
  const { run } = Route.useSearch()

  return (
    <AutomationEditor
      // Remount when switching flows so editor state never leaks across ids.
      key={automation.id}
      initial={automation}
      initialFavoriteNodeKeys={favoriteNodeKeys}
      initialRuns={runs}
      openRunId={run}
    />
  )
}
