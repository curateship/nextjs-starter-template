import { createFileRoute } from "@tanstack/react-router"

import { AgentEditor } from "@/components/agent-editor"
import { getAgent } from "@/lib/api/agents"

export const Route = createFileRoute("/_authenticated/admin/agents/$agentId")({
  loader: async ({ params }) => getAgent(params.agentId),
  component: AgentEditorRoute,
})

function AgentEditorRoute() {
  const agent = Route.useLoaderData()
  // Remount the editor when navigating between agents so form state resets.
  return <AgentEditor key={agent.id} agent={agent} />
}
