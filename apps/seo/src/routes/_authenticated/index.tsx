import { createFileRoute } from "@tanstack/react-router"

import { ProjectOverviewDashboard } from "@/components/project-overview"
import { loadCurrentProjectOverview } from "@/lib/api/seo-projects"

export const Route = createFileRoute("/_authenticated/")({
  loader: () => loadCurrentProjectOverview(),
  component: OverviewRoute,
})

function OverviewRoute() {
  const { project, overview } = Route.useLoaderData()
  return <ProjectOverviewDashboard project={project} overview={overview} />
}
