import { createFileRoute } from "@tanstack/react-router"

import { KeywordsDashboard } from "@/components/keywords-dashboard"
import { loadCurrentProject } from "@/lib/api/seo-projects"

export const Route = createFileRoute("/_authenticated/keywords")({
  validateSearch: (search: Record<string, unknown>): { source?: string } => ({
    source: typeof search.source === "string" ? search.source : undefined,
  }),
  loader: () => loadCurrentProject(),
  component: KeywordsRoute,
})

function KeywordsRoute() {
  const { project } = Route.useLoaderData()
  const { source } = Route.useSearch()
  return (
    <KeywordsDashboard
      key={`${project.id}-${source ?? "all"}`}
      project={project}
      initialSource={source}
    />
  )
}
