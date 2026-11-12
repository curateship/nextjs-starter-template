import { createFileRoute } from "@tanstack/react-router"

import { AutomationsDashboard, type AutomationsLoaded } from "@/components/automations/automations-dashboard"
import { routeErrorComponent } from "@/components/shell/route-error"
import { listWaitingRuns } from "@/lib/api/automations/automation-runs"
import { getAutomationTemplate } from "@/lib/api/automations/automation-templates"
import {
  getAutomation,
  getAutomationLoadErrorMessage,
  loadAutomationFavorites,
  loadAutomationsPage,
} from "@/lib/api/automations/automations"
import { loadBroadcastBlockDefaults } from "@/lib/api/email/broadcasts"
import {
  automationTabOf,
  readAutomationsSearch,
  type AutomationsSearch,
} from "@/lib/automations/automations-search"

/**
 * The Automations dashboard (Tyler, 9 Nov 2026: "turn the automation
 * dashboard into the 3 panel design pattern"). The left page's Dashboards
 * block picks the section: Automations or Waiting on you;
 * `src/lib/automations/automations-search.ts` says which address keys belong
 * to which. A flow's canvas opens here too (`?full=1`), as does a template's
 * (`?template=`): the old `/admin/automations/<id>` and
 * `/admin/automations/templates/<key>` addresses are gone.
 */
export const Route = createFileRoute("/_authenticated/admin/automations")({
  // The canvas keeps its own graph state. Never redraw it from a cached
  // loader answer after somebody leaves, or a saved step could look lost.
  gcTime: 0,
  validateSearch: readAutomationsSearch,
  // Only what changes the rows read. The picked line, the step picked on a
  // canvas, its tab and its run are the screen's own, and must not read the
  // list again.
  loaderDeps: ({ search }) => ({
    tab: search.tab,
    flowOpen: search.full ? search.open : undefined,
    template: search.template,
    q: search.tab === "waiting" ? search.q : undefined,
  }),
  loader: ({ deps }) => loadAutomationsDashboard(deps),
  component: AdminAutomationsRoute,
  errorComponent: routeErrorComponent(getAutomationLoadErrorMessage),
})

async function loadAutomationsDashboard(deps: {
  tab?: AutomationsSearch["tab"]
  flowOpen?: string
  template?: AutomationsSearch["template"]
  q?: string
}): Promise<AutomationsLoaded> {
  const tab = automationTabOf({ tab: deps.tab })

  if (tab === "waiting") {
    return { tab, runs: await listWaitingRuns({ search: deps.q }) }
  }

  const canvasRead = (() => {
    if (!deps.flowOpen && !deps.template) return Promise.resolve(null)
    const extras = Promise.all([
      loadAutomationFavorites(),
      // The saved block setups are a convenience; a failure falls back to the built-in ones.
      loadBroadcastBlockDefaults().catch(() => ({ defaults: {} })),
    ])
    if (deps.template) {
      return Promise.all([getAutomationTemplate(deps.template), extras]).then(
        ([template, [favorites, blockDefaults]]) => ({
          kind: "template" as const,
          template,
          favoriteNodeKeys: favorites.favoriteNodeKeys,
          blockDefaults: blockDefaults.defaults,
        })
      )
    }
    return Promise.all([getAutomation(deps.flowOpen!), extras]).then(([automation, [favorites, blockDefaults]]) => ({
      kind: "flow" as const,
      automation,
      favoriteNodeKeys: favorites.favoriteNodeKeys,
      blockDefaults: blockDefaults.defaults,
    }))
  })()
  const [page, canvas] = await Promise.all([loadAutomationsPage(), canvasRead])
  return { tab: "automations", page, canvas }
}

function AdminAutomationsRoute() {
  return <AutomationsDashboard loaded={Route.useLoaderData()} search={Route.useSearch()} />
}
