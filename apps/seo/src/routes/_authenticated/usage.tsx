import { createFileRoute } from "@tanstack/react-router"

import { UsageDashboard } from "@/components/usage-dashboard"
import { loadProjects } from "@/lib/api/seo-projects"
import { loadUsageSummary } from "@/lib/api/usage"

export const Route = createFileRoute("/_authenticated/usage")({
  loader: async () => {
    const [{ summary, endpoints }, { projects }] = await Promise.all([
      loadUsageSummary(),
      loadProjects(),
    ])
    return { summary, endpoints, projects }
  },
  component: UsageRoute,
})

function UsageRoute() {
  const { summary, endpoints, projects } = Route.useLoaderData()
  return (
    <UsageDashboard
      summary={summary}
      endpoints={endpoints}
      projects={projects}
    />
  )
}
