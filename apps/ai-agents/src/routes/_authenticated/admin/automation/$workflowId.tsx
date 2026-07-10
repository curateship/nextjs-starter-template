import { createFileRoute } from "@tanstack/react-router"

import { AutomationCanvas } from "@/components/automation/automation-canvas"
import { getWorkflowEditorData } from "@/lib/api/workflows"

export const Route = createFileRoute(
  "/_authenticated/admin/automation/$workflowId"
)({
  loader: async ({ params }) => getWorkflowEditorData(params.workflowId),
  component: AutomationEditorRoute,
})

function AutomationEditorRoute() {
  const data = Route.useLoaderData()
  // Remount when switching workflows so canvas + run poll state resets.
  return <AutomationCanvas key={data.workflow.id} initial={data} />
}
