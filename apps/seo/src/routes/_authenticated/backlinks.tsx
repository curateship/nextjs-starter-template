import { createFileRoute } from "@tanstack/react-router"

import { BacklinksDashboard } from "@/components/backlinks-dashboard"
import { loadCurrentProject } from "@/lib/api/seo-projects"

export const Route = createFileRoute("/_authenticated/backlinks")({
  loader: () => loadCurrentProject(),
  component: BacklinksRoute,
})

function BacklinksRoute() {
  const { project, competitors } = Route.useLoaderData()
  return <BacklinksDashboard project={project} competitors={competitors} />
}
