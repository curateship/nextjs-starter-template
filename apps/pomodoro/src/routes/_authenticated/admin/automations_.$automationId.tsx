import { createFileRoute } from "@tanstack/react-router"

import { AutomationEditor } from "@/components/automations/automation-editor"
import { loadAutomationRunsPanel } from "@/lib/api/automations/automation-runs"
import { loadBroadcastBlockDefaults } from "@/lib/api/email/broadcasts"
import {
  getAutomation,
  getAutomationLoadErrorMessage,
  loadAutomationFavorites,
} from "@/lib/api/automations/automations"
import { routeErrorComponent } from "@/components/shell/route-error"

/**
 * `?run=<id>` is which run the bottom panel opens with — that is what makes one
 * run linkable from a bell notice.
 *
 * `?node=<id or kind>` is which step opens selected, so a page built from one
 * step can send somebody back to the settings that produced it. A kind is
 * allowed as well as an id because the sender usually knows what the step IS
 * without knowing which copy of it a particular flow holds.
 *
 * Both are checked before use, and dropped when they are not usable.
 */
type EditorSearch = { run?: string; node?: string }

function readEditorSearch(search: Record<string, unknown>): EditorSearch {
  return {
    run:
      typeof search.run === "string" && search.run.length <= 36
        ? search.run
        : undefined,
    node:
      typeof search.node === "string" &&
      search.node.length > 0 &&
      search.node.length <= 64
        ? search.node
        : undefined,
  }
}

export const Route = createFileRoute(
  "/_authenticated/admin/automations_/$automationId"
)({
  // The editor keeps its own graph state. Never remount it from a cached
  // loader result after somebody leaves without using Back to flow, or a
  // correctly saved node can look as though it disappeared.
  gcTime: 0,
  validateSearch: readEditorSearch,
  loader: async ({ params }) => {
    const [automation, favorites, runs, blockDefaults] = await Promise.all([
      getAutomation(params.automationId),
      loadAutomationFavorites(),
      loadAutomationRunsPanel(params.automationId),
      loadBroadcastBlockDefaults().catch(() => ({ defaults: {} })),
    ])
    return {
      automation,
      favoriteNodeKeys: favorites.favoriteNodeKeys,
      runs,
      blockDefaults: blockDefaults.defaults,
    }
  },
  component: AdminAutomationEditorRoute,
  errorComponent: routeErrorComponent(getAutomationLoadErrorMessage),
})

function AdminAutomationEditorRoute() {
  const { automation, favoriteNodeKeys, runs, blockDefaults } =
    Route.useLoaderData()
  const { run, node } = Route.useSearch()

  return (
    <AutomationEditor
      // Remount when switching flows so editor state never leaks across ids.
      key={automation.id}
      initial={automation}
      initialFavoriteNodeKeys={favoriteNodeKeys}
      initialRuns={runs}
      initialBlockDefaults={blockDefaults}
      openRunId={run}
      openNode={node}
    />
  )
}
