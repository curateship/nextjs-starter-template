import { createFileRoute } from "@tanstack/react-router"

import { AutomationEditor } from "@/components/automations/automation-editor"
import { routeErrorComponent } from "@/components/shell/route-error"
import {
  getAutomationTemplate,
  getAutomationTemplateLoadErrorMessage,
  saveAutomationTemplateGraph,
} from "@/lib/api/automations/automation-templates"
import { loadAutomationFavorites } from "@/lib/api/automations/automations"
import { loadBroadcastBlockDefaults } from "@/lib/api/email/broadcasts"
import { isAutomationTemplateKey } from "@/lib/automations/templates"

export const Route = createFileRoute(
  "/_authenticated/admin/automations_/templates_/$templateKey"
)({
  gcTime: 0,
  loader: async ({ params }) => {
    if (!isAutomationTemplateKey(params.templateKey)) {
      throw new Error("That automation template does not exist.")
    }
    const [template, favorites, blockDefaults] = await Promise.all([
      getAutomationTemplate(params.templateKey),
      loadAutomationFavorites(),
      loadBroadcastBlockDefaults().catch(() => ({ defaults: {} })),
    ])
    return {
      template,
      favoriteNodeKeys: favorites.favoriteNodeKeys,
      blockDefaults: blockDefaults.defaults,
    }
  },
  component: AdminAutomationTemplateEditorRoute,
  errorComponent: routeErrorComponent(getAutomationTemplateLoadErrorMessage),
})

function AdminAutomationTemplateEditorRoute() {
  const { template, favoriteNodeKeys, blockDefaults } = Route.useLoaderData()

  return (
    <AutomationEditor
      key={template.key}
      mode="template"
      initial={{
        id: template.key,
        name: template.name,
        graph: template.graph,
        enabled: false,
      }}
      initialFavoriteNodeKeys={favoriteNodeKeys}
      initialBlockDefaults={blockDefaults}
      onSaveTemplateGraph={(graph) =>
        saveAutomationTemplateGraph({
          templateKey: template.key,
          graph,
        })
      }
    />
  )
}
