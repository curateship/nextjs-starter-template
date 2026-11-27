import { createFileRoute } from "@tanstack/react-router"

import { ProjectsDashboard } from "@/components/social/projects-dashboard/projects-dashboard"
import { loadViralSection } from "@/components/viral/dashboard/load-section"
import { routeErrorComponent } from "@/components/shell/route-error"
import { loadArchiveProjects } from "@/lib/api/archive/items"
import { loadMessages } from "@/lib/api/social/phone-apps"
import { getProjectErrorMessage, loadProjectRows } from "@/lib/api/social/projects"
import { loadRedditAccounts } from "@/lib/api/social/reddit-accounts"
import { researchSearchOf } from "@/lib/content-app/research-search"
import { readProjectsSearch } from "@/lib/social/projects-dashboard-search"

/**
 * The Projects dashboard (`workspace/docs/projects-dashboard.md`), where
 * Projects in the left menu leads: Overview, Projects, Accounts and Messages
 * as sections of one three-panel dashboard (Tyler, 12 Nov 2026), and in
 * Content Research's Vault, Hooks and Formats in the Viral block. The section, the project picked, the filters and the open
 * row live in the address (`readProjectsSearch`). A project's own page,
 * where its posting and commenting happen, is `/admin/projects/<id>`.
 *
 * Every section's rows are read here at once, so each row of the Dashboards
 * block has its count from the start and a switch draws at once.
 */
export const Route = createFileRoute("/_authenticated/admin/projects")({
  validateSearch: (search: Record<string, unknown>) => readProjectsSearch(search),
  // Research's sections read their list again when its filters change (`content-app.md`).
  loaderDeps: ({ search }) => ({ research: researchSearchOf(search) }),
  loader: async ({ deps }) => {
    const [projects, accounts, messages, archive, research] = await Promise.all([
      loadProjectRows(),
      loadRedditAccounts(false),
      loadMessages(),
      loadArchiveProjects(),
      deps.research ? loadViralSection(deps.research) : null,
    ])
    return { projects, accounts, messages, archive, research }
  },
  errorComponent: routeErrorComponent(getProjectErrorMessage),
  component: ProjectsRoute,
})

function ProjectsRoute() {
  return <ProjectsDashboard data={Route.useLoaderData()} search={Route.useSearch()} />
}
