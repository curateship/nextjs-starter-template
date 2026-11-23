import { createFileRoute, redirect } from "@tanstack/react-router"

import { ProjectRouteError } from "@/components/project/project-route-error"
import { ProjectWorkspace } from "@/components/project/project-workspace"
import { loadProject } from "@/lib/api/project/projects"
import { readTaskFilters, type TaskFilters } from "@/lib/project/task-filters"
import { pageTitleHead } from "@/lib/project/page-title"
import { projectSectionKey, readProjectSection, type ProjectSection } from "@/lib/project/project-sections"
import { TeamScope } from "@/lib/project/team-scope"

type ProjectSearch = TaskFilters & {
  /** The task open in the middle panel, so a bell notice can open it. */
  task?: string
  /** Opens the Chat tab, for a project chat's bell notice. */
  chat?: 1
  /** The dashboard showing: Notes or Milestones. Left out, it goes by what the address opens. */
  section?: ProjectSection
  /** The note open on the Notes dashboard, and where a # link to it lands. */
  note?: string
  /** The milestone open on the Milestones dashboard. */
  milestone?: string
}

function readProjectSearch(search: Record<string, unknown>): ProjectSearch {
  // Every task on a project has the project's one client, so the page has no Client filter.
  const { client: _client, project: _project, ...filters } = readTaskFilters(search)
  const result: ProjectSearch = filters
  if (typeof search.task === "string" && search.task.length <= 36) result.task = search.task
  if (search.chat === 1 || search.chat === "1") result.chat = 1
  if (typeof search.note === "string" && search.note.length <= 36) result.note = search.note
  if (typeof search.milestone === "string" && search.milestone.length <= 36) result.milestone = search.milestone
  const section = readProjectSection(search.section)
  if (section && section !== "tasks") result.section = section
  return result
}

/** One project: details, tasks and members, side by side. */
export const Route = createFileRoute("/_authenticated/projects/$projectId")({
  validateSearch: readProjectSearch,
  // A bare address, as from a project's name in a list, goes back to the dashboard this
  // browser had open on the project, Notes or Milestones, before anything loads. Only on
  // arrival: picking Tasks on the page leaves a bare address that must stay on Tasks.
  beforeLoad: ({ search, params, cause }) => {
    if (typeof window === "undefined" || cause !== "enter") return
    if (search.section || search.task || search.chat || search.note || search.milestone) return
    let saved: ProjectSection | undefined
    try {
      saved = readProjectSection(window.localStorage.getItem(projectSectionKey(params.projectId)))
    } catch {
      return
    }
    if (!saved || saved === "tasks") return
    throw redirect({ to: "/projects/$projectId", params, search: { ...search, section: saved }, replace: true })
  },
  // Opening a task must not reload the project under it; the window loads its own.
  loaderDeps: () => ({}),
  loader: ({ params }) => loadProject(params.projectId),
  head: ({ loaderData, matches }) => pageTitleHead(loaderData?.project.name ?? "Project", matches),
  component: ProjectRoute,
  errorComponent: ProjectRouteError,
})

function ProjectRoute() {
  const page = Route.useLoaderData()
  const { task, chat, note, milestone, section, ...filters } = Route.useSearch()
  // The site admin is on no team, so the page names the project's own.
  return (
    <TeamScope teamId={page.project.teamId}>
      <ProjectWorkspace
        key={page.project.id}
        page={page}
        openTaskId={task}
        filters={filters}
        openChat={chat === 1}
        address={{ section, note, milestone }}
      />
    </TeamScope>
  )
}
