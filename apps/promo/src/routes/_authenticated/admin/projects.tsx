import { createFileRoute } from "@tanstack/react-router"

import { ProjectsDashboard } from "@/components/social/projects-dashboard/projects-dashboard"
import { routeErrorComponent } from "@/components/shell/route-error"
import { loadArchiveProjects } from "@/lib/api/archive/items"
import { loadSavedViews } from "@/lib/api/saved-views"
import { loadMessages } from "@/lib/api/social/phone-apps"
import { getProjectErrorMessage, loadProjectRows } from "@/lib/api/social/projects"
import { loadRedditAccounts } from "@/lib/api/social/reddit-accounts"
import { loadVoices } from "@/lib/api/social/voices"
import { ARCHIVE_VIEW_KIND } from "@/lib/archive/search"
import { readProjectsSearch } from "@/lib/social/projects-dashboard-search"

/**
 * The Projects dashboard (`workspace/docs/projects-dashboard.md`), where
 * Projects in the left menu leads: Overview, Projects, Voices, Accounts,
 * Archive and Messages as sections of one three-panel dashboard (Tyler,
 * 12 Nov 2026). The section, the project picked, the filters and the open
 * row live in the address (`readProjectsSearch`). A project's own page,
 * where its posting and commenting happen, is `/admin/projects/<id>`.
 *
 * Every section's rows are read here at once, so each row of the Dashboards
 * block has its count from the start and a switch draws at once. The
 * Archive's saved views are the picked project's, so they are read again
 * when the project changes.
 */
export const Route = createFileRoute("/_authenticated/admin/projects")({
  validateSearch: (search: Record<string, unknown>) => readProjectsSearch(search),
  loaderDeps: ({ search }) => ({ project: search.project }),
  loader: async ({ deps }) => {
    const [projects, voices, accounts, messages, archive] = await Promise.all([
      loadProjectRows(),
      loadVoices(),
      loadRedditAccounts(false),
      loadMessages(),
      loadArchiveProjects(),
    ])
    const picked = archive.find((row) => row.id === deps.project)
    const archiveViews = picked ? await loadSavedViews(`${ARCHIVE_VIEW_KIND}:${picked.id}`) : []
    return { projects, voices, accounts, messages, archive, archiveViews }
  },
  errorComponent: routeErrorComponent(getProjectErrorMessage),
  component: ProjectsRoute,
})

function ProjectsRoute() {
  return <ProjectsDashboard data={Route.useLoaderData()} search={Route.useSearch()} />
}
