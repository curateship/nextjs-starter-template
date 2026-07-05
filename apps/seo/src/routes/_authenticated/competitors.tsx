import { createFileRoute } from "@tanstack/react-router"

import { CompetitorsDashboard } from "@/components/competitors-dashboard"
import { loadCurrentProject } from "@/lib/api/seo-projects"

export const Route = createFileRoute("/_authenticated/competitors")({
  loader: () => loadCurrentProject(),
  component: CompetitorsRoute,
})

function CompetitorsRoute() {
  const { project, competitors } = Route.useLoaderData()
  return (
    <CompetitorsDashboard project={project} initialCompetitors={competitors} />
  )
}
