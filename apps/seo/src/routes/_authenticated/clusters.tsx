import { createFileRoute } from "@tanstack/react-router"

import { ClustersDashboard } from "@/components/clusters-dashboard"
import { loadCurrentProject } from "@/lib/api/seo-projects"

export const Route = createFileRoute("/_authenticated/clusters")({
  loader: () => loadCurrentProject(),
  component: ClustersRoute,
})

function ClustersRoute() {
  const { project } = Route.useLoaderData()
  return <ClustersDashboard project={project} />
}
