import * as React from "react"
import { getRouteApi, useNavigate, useRouter } from "@tanstack/react-router"
import { CopyIcon, FilmIcon, PlusIcon, SettingsIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import { DashboardTable } from "@/components/shared/dashboard-table"
import {
  DashboardToolbarButton,
  DashboardToolbarSearch,
} from "@/components/shared/dashboard-toolbar"
import {
  SortableTableHeader,
  type SortableColumn,
} from "@/components/shared/sortable-table-header"
import { useShellRuntime } from "@/components/shell/shell-layout"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { TableCell, TableHead, TableRow } from "@/components/ui/table"
import {
  createProject,
  deleteProjects,
  duplicateProject,
  getProjectErrorMessage,
  saveProjectTimeline,
  type ProjectItem,
  type ProjectListResponse,
} from "@/lib/api/video/projects"
import { describeBulkResult } from "@/lib/format/bulk-result"
import { formatDate } from "@/lib/format/format-time"
import { plural } from "@/lib/format/plural"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { useClearSelectionOnListChange } from "@/lib/hooks/use-clear-selection"
import { useSelection } from "@/lib/hooks/use-selection"
import {
  useListSearchNavigate,
  useListSort,
  useSearchBoxText,
} from "@/lib/nav/list-search"
import { showErrorToast } from "@/lib/toast/error-toast"
import { editorId, formatClock } from "@/lib/video/timeline-utils"
import { ProjectFormDialog } from "@/components/video-editor/project-form-dialog"

const projectsRoute = getRouteApi("/_authenticated/admin/video-editor")

export type ProjectSortColumn = "name" | "clips" | "length" | "aspect" | "updated"

const PROJECT_COLUMNS: SortableColumn<ProjectSortColumn>[] = [
  { key: "name", label: "Project", column: "main" },
  { key: "clips", label: "Clips", column: "meta" },
  { key: "length", label: "Length", column: "meta" },
  { key: "aspect", label: "Shape", column: "meta" },
  { key: "updated", label: "Changed", column: "meta" },
]

function compareProjects(
  a: ProjectItem,
  b: ProjectItem,
  column: ProjectSortColumn
) {
  switch (column) {
    case "clips":
      return a.clip_count - b.clip_count
    case "length":
      return a.duration_ms - b.duration_ms
    case "aspect":
      return a.aspect.localeCompare(b.aspect)
    case "updated":
      return Date.parse(a.updated_at) - Date.parse(b.updated_at)
    default:
      return a.name.localeCompare(b.name)
  }
}

/**
 * Every project, newest change first. A row opens the editor; the settings icon
 * renames it without leaving the list.
 */
export function ProjectsPage({ initial }: { initial: ProjectListResponse }) {
  const { config } = useShellRuntime()
  const router = useRouter()
  const navigate = useNavigate()
  // Search, sort and page live in the address, so Back returns this list.
  const listSearch = projectsRoute.useSearch()
  const setListSearch = useListSearchNavigate()
  const searchQuery = listSearch.q ?? ""
  const currentPage = listSearch.page ?? 1
  const [searchText, setSearchText] = useSearchBoxText(searchQuery, (text) =>
    setListSearch({ q: text.trim() ? text : undefined, page: undefined })
  )
  const sort: ProjectSortColumn = listSearch.sort ?? "updated"
  const direction = listSearch.direction ?? "desc"
  const toggleSort = useListSort<ProjectSortColumn>({ sort, direction })

  const [pageSize, setPageSize] = React.useState(config.dashboardRowsPerPage)
  const [formOpen, setFormOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<ProjectItem | null>(null)
  const [deleteTargets, setDeleteTargets] = React.useState<ProjectItem[]>([])
  const [run, busy] = useAsyncAction(getProjectErrorMessage)
  const selection = useSelection()

  const projects = initial.projects
  const sortedProjects = React.useMemo(() => {
    const factor = direction === "asc" ? 1 : -1
    return [...projects].sort((a, b) => factor * compareProjects(a, b, sort))
  }, [direction, projects, sort])

  const totalPages = Math.ceil(sortedProjects.length / pageSize)
  const visibleProjects = React.useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return sortedProjects.slice(start, start + pageSize)
  }, [currentPage, pageSize, sortedProjects])
  const visibleIds = visibleProjects.map((project) => project.id)

  useClearSelectionOnListChange(
    selection.setSelected,
    `${searchQuery}|${sort}|${direction}|${currentPage}|${pageSize}`
  )

  function openEditor(project: ProjectItem) {
    void navigate({
      to: "/admin/video-editor/$projectId",
      params: { projectId: project.id },
    })
  }

  // Something to look at on a brand new install: a project that already has a
  // title and a caption on the timeline, so the editor opens with the stage,
  // the lanes and the inspector all showing real work rather than empty boxes.
  async function createSampleProject() {
    await run(async () => {
      const created = await createProject("Sample project")
      const track = {
        id: editorId(),
        muted: false,
        clips: [
          {
            id: editorId(),
            kind: "text" as const,
            name: "Text",
            text: "Your hook goes here",
            fontId: "inter" as const,
            fontSize: 110,
            color: "#ffffff",
            y: 0.28,
            startMs: 0,
            durationMs: 3000,
            trimStartMs: 0,
          },
          {
            id: editorId(),
            kind: "text" as const,
            name: "Text",
            text: "Then the line that keeps them watching",
            fontId: "inter" as const,
            fontSize: 60,
            color: "#ffffff",
            y: 0.78,
            startMs: 3000,
            durationMs: 3000,
            trimStartMs: 0,
          },
        ],
      }
      await saveProjectTimeline(
        created.id,
        { aspect: "9:16", tracks: [track] },
        created.version
      )
      openEditor(created)
    })
  }

  async function handleDuplicate(project: ProjectItem) {
    await run(async () => {
      const copy = await duplicateProject(project.id)
      await router.invalidate()
      toast.success(`"${copy.name}" created.`)
    })
  }

  async function confirmDelete() {
    if (!deleteTargets.length) return
    await run(async () => {
      const { deleted_ids: deleted } = await deleteProjects(
        deleteTargets.map((project) => project.id)
      )
      if (deleted.length === 0) {
        showErrorToast(
          "Nothing was deleted — those projects may already be gone."
        )
        return
      }
      selection.clear()
      setDeleteTargets([])
      await router.invalidate()
      toast.success(
        describeBulkResult({
          done: deleted.length,
          kept: deleteTargets.length - deleted.length,
          one: "project",
          many: "projects",
          verb: "deleted",
        })
      )
    })
  }

  const selectedProjects = projects.filter((project) =>
    selection.selected.has(project.id)
  )
  const selectedCount = selection.selected.size
  // The list holds one page of the newest projects; the search reaches the
  // rest, and this says so rather than quietly showing a shorter list.
  const hasMoreThanLoaded = initial.total > projects.length

  return (
    <>
      <DashboardTable
        title="Projects"
        icon={<FilmIcon />}
        count={initial.total}
        selectedCount={selectedCount}
        onClearSelection={selection.clear}
        controls={
          <>
            {selectedCount ? (
              <DashboardToolbarButton
                type="button"
                variant="destructive"
                disabled={busy}
                onClick={() => setDeleteTargets(selectedProjects)}
              >
                <Trash2Icon className="size-4" />
                Delete ({selectedCount})
              </DashboardToolbarButton>
            ) : null}
            <DashboardToolbarSearch
              name="project-search"
              aria-label="Search projects"
              placeholder="Search projects…"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
            />
            {projects.length === 0 && !searchQuery ? (
              <DashboardToolbarButton
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => void createSampleProject()}
              >
                Add a sample project
              </DashboardToolbarButton>
            ) : null}
            <DashboardToolbarButton
              type="button"
              onClick={() => {
                setEditing(null)
                setFormOpen(true)
              }}
            >
              <PlusIcon className="size-4" />
              New project
            </DashboardToolbarButton>
          </>
        }
        header={
          <SortableTableHeader
            columns={PROJECT_COLUMNS}
            sort={sort}
            direction={direction}
            onSort={toggleSort}
            leading={
              <TableHead column="select">
                <Checkbox
                  checked={selection.selectAllState(visibleIds)}
                  onCheckedChange={() => selection.toggleVisible(visibleIds)}
                  aria-label="Select visible projects"
                />
              </TableHead>
            }
            trailing={<TableHead column="meta">Actions</TableHead>}
          />
        }
        isEmpty={sortedProjects.length === 0}
        emptyText={
          searchQuery
            ? "No projects match that search."
            : "No projects yet. Make one to start editing."
        }
        emptyColSpan={7}
        footer={{
          type: "pagination",
          page: currentPage,
          pageSize,
          total: sortedProjects.length,
          totalPages,
          onPageChange: (next) =>
            setListSearch({ page: next > 1 ? next : undefined }),
          onPageSizeChange: (size) => {
            setPageSize(size)
            setListSearch({ page: undefined })
          },
        }}
      >
        {visibleProjects.map((project) => (
          <TableRow
            key={project.id}
            className="group"
            rowAction={() => openEditor(project)}
          >
            <TableCell column="select">
              <Checkbox
                checked={selection.selected.has(project.id)}
                onCheckedChange={() => selection.toggle(project.id)}
                aria-label={`Select ${project.name}`}
              />
            </TableCell>
            <TableCell column="main">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
                  {project.thumbnail_url ? (
                    <img
                      src={project.thumbnail_url}
                      alt=""
                      className="size-full object-cover"
                    />
                  ) : (
                    <FilmIcon className="size-4 text-muted-foreground" />
                  )}
                </span>
                <button
                  type="button"
                  className="block max-w-full truncate text-left font-medium group-hover:underline"
                  onClick={() => openEditor(project)}
                  title={project.name}
                >
                  {project.name}
                </button>
              </div>
            </TableCell>
            <TableCell column="meta">{project.clip_count}</TableCell>
            <TableCell column="meta">
              {formatClock(project.duration_ms)}
            </TableCell>
            <TableCell column="meta">{project.aspect}</TableCell>
            <TableCell column="meta">{formatDate(project.updated_at)}</TableCell>
            <TableCell column="actions">
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={busy}
                  onClick={() => void handleDuplicate(project)}
                  aria-label={`Duplicate ${project.name}`}
                  title={`Duplicate ${project.name}`}
                >
                  <CopyIcon className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setEditing(project)
                    setFormOpen(true)
                  }}
                  aria-label={`Rename ${project.name}`}
                  title={`Rename ${project.name}`}
                >
                  <SettingsIcon className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setDeleteTargets([project])}
                  aria-label={`Delete ${project.name}`}
                  title={`Delete ${project.name}`}
                >
                  <Trash2Icon className="size-4" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </DashboardTable>

      {hasMoreThanLoaded ? (
        <p className="text-sm text-muted-foreground">
          Showing the {projects.length} most recently changed of{" "}
          {initial.total} projects. Search to find the older ones.
        </p>
      ) : null}

      <ProjectFormDialog
        open={formOpen}
        project={editing}
        onClose={() => {
          setFormOpen(false)
          setEditing(null)
        }}
        onCreated={(created) => openEditor(created)}
        onSaved={() => void router.invalidate()}
      />

      <ConfirmDialog
        open={deleteTargets.length > 0}
        onOpenChange={(open) => {
          if (!open) setDeleteTargets([])
        }}
        title={
          deleteTargets.length > 1
            ? `Delete ${deleteTargets.length} ${plural(deleteTargets.length, "project", "projects")}?`
            : "Delete this project?"
        }
        description="The timeline goes for good. The footage it used stays in your media library."
        confirmLabel={
          deleteTargets.length > 1 ? "Delete projects" : "Delete project"
        }
        loading={busy}
        onConfirm={confirmDelete}
      />
    </>
  )
}
