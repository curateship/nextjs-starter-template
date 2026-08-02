import { createFileRoute } from "@tanstack/react-router"

import { AutomationEditor } from "@/components/automations/automation-editor"
import {
  getAutomation,
  getAutomationLoadErrorMessage,
  loadAutomationFavorites,
} from "@/lib/api/automations"
import { routeErrorComponent } from "@/components/shell/route-error"

export const Route = createFileRoute(
  "/_authenticated/admin/automations_/$automationId"
)({
  loader: async ({ params }) => {
    const [automation, favorites] = await Promise.all([
      getAutomation(params.automationId),
      loadAutomationFavorites(),
    ])
    return { automation, favoriteNodeKeys: favorites.favoriteNodeKeys }
  },
  component: AdminAutomationEditorRoute,
  errorComponent: routeErrorComponent(getAutomationLoadErrorMessage),
})

function AdminAutomationEditorRoute() {
  const { automation, favoriteNodeKeys } = Route.useLoaderData()

  return (
    <AutomationEditor
      // Remount when switching flows so editor state never leaks across ids.
      key={automation.id}
      initial={automation}
      initialFavoriteNodeKeys={favoriteNodeKeys}
    />
  )
}
