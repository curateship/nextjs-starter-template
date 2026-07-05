import { createFileRoute } from "@tanstack/react-router"

import { ContentPlanDashboard } from "@/components/content-plan-dashboard"
import { loadCurrentProject } from "@/lib/api/seo-projects"

export const Route = createFileRoute("/_authenticated/content-plan")({
  loader: () => loadCurrentProject(),
  component: ContentPlanRoute,
})

function ContentPlanRoute() {
  const { project } = Route.useLoaderData()
  return <ContentPlanDashboard project={project} />
}
