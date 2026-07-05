import { createFileRoute } from "@tanstack/react-router"

import { RankingsDashboard } from "@/components/rankings-dashboard"
import { loadCurrentProject } from "@/lib/api/seo-projects"

export const Route = createFileRoute("/_authenticated/rankings")({
  loader: () => loadCurrentProject(),
  component: RankingsRoute,
})

function RankingsRoute() {
  const { project } = Route.useLoaderData()
  return <RankingsDashboard project={project} />
}
