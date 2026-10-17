import * as React from "react"
import { getRouteApi, useNavigate, useRouter } from "@tanstack/react-router"
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  CopyIcon,
  FilmIcon,
  PinIcon,
  PinOffIcon,
  PlusIcon,
  SettingsIcon,
  Trash2Icon,
} from "lucide-react"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { TableCell, TableHead, TableRow } from "@/components/ui/table"
import type { ActorItem } from "@/lib/api/video/actors"
import {
  archiveProjects,
  createProject,
  deleteProjects,
  duplicateProject,
  getProjectErrorMessage,
  loadProjectDeleteSummary,
  pinProject,
  saveProjectTimeline,
  type ProjectDeleteSummary,
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
import { cn } from "@/lib/utils"
import { editorId, formatClock } from "@/lib/video/timeline-utils"
import { ProjectFormDialog } from "@/components/video-editor/project-form-dialog"
import {
  FolderMenu,
  MoveToFolderMenu,
} from "@/components/video-editor/project-folders"
import type { ProjectFolderSummary } from "@/lib/api/video/project-folders"
import { ARCHIVED_PROJECTS, NO_FOLDER } from "@/lib/video/project-folders"

const projectsRoute = getRouteApi("/_authenticated/admin/video-editor/")

// How often the list looks again while a project's picture is being made. The
// background worker runs every fifteen seconds, so this catches it within one.
const THUMBNAIL_POLL_MS = 5000

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

/** "3 first frames, 2 AI clips and 1 export", leaving out the ones at none. */
function describeMadeForProjects(summary: ProjectDeleteSummary) {
  const parts = [
    summary.first_frames
      ? `${summary.first_frames} ${plural(summary.first_frames, "first frame")}`
      : null,
    summary.ai_clips
      ? `${summary.ai_clips} ${plural(summary.ai_clips, "AI clip")}`
      : null,
    summary.exports
      ? `${summary.exports} ${plural(summary.exports, "export")} with ${plural(summary.exports, "its share link", "their share links")}`
      : null,
  ].filter((part): part is string => part !== null)
  if (!parts.length) return null
  return parts.length === 1
    ? parts[0]
    : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`
}

/**
 * Every project, pinned ones first and then the newest change, or one
 * folder's worth, or the archived ones. A row opens the editor; the settings
 * icon renames it without leaving the list.
 */
export function ProjectsPage({
  initial,
  folders,
  actors,
}: {
  initial: ProjectListResponse
  folders: ProjectFolderSummary[]
  /** Every actor, for the filter by actor. */
  actors: ActorItem[]
}) {
  const { config } = useShellRuntime()
  const router = useRouter()
  const navigate = useNavigate()
  // Search, sort, page and folder live in the address, so Back returns this
  // list and a reload keeps it.
  const listSearch = projectsRoute.useSearch()
  const setListSearch = useListSearchNavigate()
  const searchQuery = listSearch.q ?? ""
  const folder = listSearch.folder
  const actorFilter = listSearch.actor
  const showingArchived = folder === ARCHIVED_PROJECTS
  // The folder a new project goes straight into: the one being shown.
  const openFolderId =
    folder && folder !== NO_FOLDER && !showingArchived ? folder : null
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
  const [deleteSummary, setDeleteSummary] =
    React.useState<ProjectDeleteSummary | null>(null)
  const [run, busy] = useAsyncAction(getProjectErrorMessage)
  const selection = useSelection()

  const projects = initial.projects
  const anyThumbnailPending = projects.some(
    (project) => project.thumbnail_pending
  )
  React.useEffect(() => {
    if (!anyThumbnailPending) return
    const timer = setInterval(() => void router.invalidate(), THUMBNAIL_POLL_MS)
    return () => clearInterval(timer)
  }, [anyThumbnailPending, router])
  // Pinned projects stay on top whatever the sort.
  const sortedProjects = React.useMemo(() => {
    const factor = direction === "asc" ? 1 : -1
    return [...projects].sort(
      (a, b) =>
        Number(b.pinned) - Number(a.pinned) ||
        factor * compareProjects(a, b, sort)
    )
  }, [direction, projects, sort])

  const totalPages = Math.ceil(sortedProjects.length / pageSize)
  const visibleProjects = React.useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return sortedProjects.slice(start, start + pageSize)
  }, [currentPage, pageSize, sortedProjects])
  const visibleIds = visibleProjects.map((project) => project.id)

  useClearSelectionOnListChange(
    selection.setSelected,
    `${searchQuery}|${folder}|${actorFilter}|${sort}|${direction}|${currentPage}|${pageSize}`
  )

  // What the delete window says goes, counted when it opens.
  const deleteKey = deleteTargets.map((project) => project.id).join(",")
  React.useEffect(() => {
    if (!deleteKey) return
    let active = true
    loadProjectDeleteSummary(deleteKey.split(","))
      .then((summary) => {
        if (active) setDeleteSummary(summary)
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [deleteKey])

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

  async function handlePin(project: ProjectItem) {
    await run(async () => {
      await pinProject(project.id, !project.pinned)
      await router.invalidate()
    })
  }

  async function handleArchive(targets: ProjectItem[], archived: boolean) {
    await run(async () => {
      const { done_ids: done } = await archiveProjects(
        targets.map((project) => project.id),
        archived
      )
      selection.clear()
      await router.invalidate()
      toast.success(
        describeBulkResult({
          done: done.length,
          kept: targets.length - done.length,
          one: "project",
          many: "projects",
          verb: archived ? "archived" : "brought back",
        })
      )
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
      const { deleted_ids: deleted, failed_ids: failed } = await deleteProjects(
        deleteTargets.map((project) => project.id)
      )
      if (failed.length) {
        showErrorToast(
          `${failed.length} ${plural(failed.length, "project was", "projects were")} kept because a file could not be removed from storage. Try again in a minute.`
        )
      }
      if (deleted.length === 0) {
        if (!failed.length) {
          showErrorToast(
            "Nothing was deleted — those projects may already be gone."
          )
        }
        return
      }
      selection.clear()
      setDeleteTargets([])
      setDeleteSummary(null)
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
        // Sits straight in the page's flex column, which would otherwise
        // squeeze it to the window's height and cut the footer off; this way
        // the page scrolls instead.
        className="shrink-0"
        count={initial.total}
        selectedCount={selectedCount}
        onClearSelection={selection.clear}
        controls={
          <>
            {selectedCount ? (
              <MoveToFolderMenu
                projectIds={selectedProjects.map((project) => project.id)}
                folders={folders}
                disabled={busy}
                onMoved={async () => {
                  selection.clear()
                  await router.invalidate()
                }}
              />
            ) : null}
            {selectedCount ? (
              <DashboardToolbarButton
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() =>
                  void handleArchive(selectedProjects, !showingArchived)
                }
              >
                {showingArchived ? (
                  <ArchiveRestoreIcon className="size-4" />
                ) : (
                  <ArchiveIcon className="size-4" />
                )}
                {showingArchived ? "Bring back" : "Archive"} ({selectedCount})
              </DashboardToolbarButton>
            ) : null}
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
            {actors.length ? (
              <Select
                value={actorFilter ?? "all"}
                onValueChange={(next) =>
                  setListSearch({
                    actor: next === "all" ? undefined : next,
                    page: undefined,
                  })
                }
              >
                <SelectTrigger aria-label="Show projects with this actor">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All actors</SelectItem>
                  {actors.map((actor) => (
                    <SelectItem key={actor.id} value={actor.id}>
                      {actor.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            <FolderMenu
              folders={folders}
              value={folder}
              onChange={(next) =>
                setListSearch({ folder: next, page: undefined })
              }
              onFoldersChanged={() => router.invalidate()}
            />
            {projects.length === 0 && !searchQuery && !folder && !actorFilter ? (
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
            : actorFilter
              ? "No project has a first frame of that actor."
              : showingArchived
                ? "Nothing is archived. Archive keeps a finished project out of the list without deleting anything."
                : folder === NO_FOLDER
              ? "Every project is in a folder."
              : folder
                ? "Nothing in this folder yet. Tick projects under All and use Move to folder."
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
            className={cn(
              "group",
              // A pinned project reads as pinned from across the list (Tyler,
              // 17 Oct 2026), in the amber the app already uses for notices.
              project.pinned &&
                "bg-amber-50 hover:bg-amber-100/70 dark:bg-amber-400/10 dark:hover:bg-amber-400/15"
            )}
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
                <div className="grid min-w-0 gap-1">
                  <button
                    type="button"
                    className="flex max-w-full items-center gap-1.5 text-left font-medium group-hover:underline"
                    onClick={() => openEditor(project)}
                  >
                    {project.pinned ? (
                      <PinIcon
                        className="size-3.5 shrink-0 text-muted-foreground"
                        aria-label="Pinned"
                      />
                    ) : null}
                    <span className="truncate">{project.name}</span>
                  </button>
                  {project.actors.length || project.source ? (
                    <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                      {project.actors.slice(0, 4).map((actor) => (
                        <img
                          key={actor.id}
                          src={actor.image_url}
                          alt={actor.name}
                          className="size-5 shrink-0 rounded-full border object-cover"
                        />
                      ))}
                      {project.actors.length > 4 ? (
                        <span className="tabular-nums">
                          +{project.actors.length - 4}
                        </span>
                      ) : null}
                      {project.source ? (
                        <span className="flex min-w-0 items-center gap-1">
                          {project.source.cover_url ? (
                            <img
                              src={project.source.cover_url}
                              alt=""
                              className="h-5 w-3 shrink-0 rounded-sm object-cover"
                            />
                          ) : null}
                          <span className="truncate">
                            Copies {project.source.title ? `“${project.source.title}”` : "a viral video"}
                          </span>
                        </span>
                      ) : null}
                    </span>
                  ) : null}
                </div>
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
                {showingArchived ? null : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={busy}
                    aria-pressed={project.pinned}
                    onClick={() => void handlePin(project)}
                    aria-label={
                      project.pinned
                        ? `Unpin ${project.name}`
                        : `Pin ${project.name} to the top`
                    }
                  >
                    {project.pinned ? (
                      <PinOffIcon className="size-4" />
                    ) : (
                      <PinIcon className="size-4" />
                    )}
                  </Button>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={busy}
                  onClick={() => void handleDuplicate(project)}
                  aria-label={`Duplicate ${project.name}`}
                >
                  <CopyIcon className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={busy}
                  onClick={() =>
                    void handleArchive([project], !showingArchived)
                  }
                  aria-label={
                    showingArchived
                      ? `Bring back ${project.name}`
                      : `Archive ${project.name}`
                  }
                >
                  {showingArchived ? (
                    <ArchiveRestoreIcon className="size-4" />
                  ) : (
                    <ArchiveIcon className="size-4" />
                  )}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setEditing(project)
                    setFormOpen(true)
                  }}
                  aria-label={`Settings for ${project.name}`}
                >
                  <SettingsIcon className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setDeleteTargets([project])}
                  aria-label={`Delete ${project.name}`}
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
        folderId={openFolderId}
        folders={folders}
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
          if (!open) {
            setDeleteTargets([])
            setDeleteSummary(null)
          }
        }}
        title={
          deleteTargets.length > 1
            ? `Delete ${deleteTargets.length} ${plural(deleteTargets.length, "project", "projects")}?`
            : "Delete this project?"
        }
        description={(() => {
          const made = deleteSummary
            ? describeMadeForProjects(deleteSummary)
            : null
          const goes = made
            ? `The timeline goes for good, and so do ${made}.`
            : "The timeline goes for good."
          return `${goes} The actors and any viral video it copies stay, and so does footage from your media library.`
        })()}
        confirmLabel={
          deleteTargets.length > 1 ? "Delete projects" : "Delete project"
        }
        loading={busy}
        onConfirm={confirmDelete}
      />
    </>
  )
}
